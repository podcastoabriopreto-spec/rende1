// Envia o lembrete "Hora de abastecer?" por Web Push.
// Chamada uma vez por dia pelo GitHub Actions (.github/workflows/lembretes.yml).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const DIA = 86_400_000;

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('Não autorizado', { status: 401 });
  }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: subs, error } = await db
    .from('push_subscriptions').select('*').eq('lembrete_ativo', true);
  if (error) return new Response(error.message, { status: 500 });

  const now = Date.now();
  let enviados = 0, removidos = 0, pulados = 0;

  for (const s of subs ?? []) {
    // Já avisou dentro do ciclo?
    if (s.ultimo_aviso && now - new Date(s.ultimo_aviso).getTime() < s.dias * DIA) { pulados++; continue; }

    // Último abastecimento de cada veículo desse usuário
    const { data: ab } = await db.from('abastecimentos')
      .select('veiculo, criado_em').eq('user_id', s.user_id)
      .order('criado_em', { ascending: false }).limit(200);

    const ultimo: Record<string, number> = {};
    for (const a of ab ?? []) if (!(a.veiculo in ultimo)) ultimo[a.veiculo] = new Date(a.criado_em).getTime();

    const atrasados = Object.entries(ultimo)
      .map(([veiculo, t]) => ({ veiculo, dias: Math.floor((now - t) / DIA) }))
      .filter((x) => x.dias >= s.dias);
    if (!atrasados.length) { pulados++; continue; }

    const nomes = atrasados.map((x) => (x.veiculo === 'moto' ? 'da moto' : 'do carro')).join(' e ');
    const maior = Math.max(...atrasados.map((x) => x.dias));
    const payload = JSON.stringify({
      titulo: `Hora de abastecer ${atrasados.length > 1 ? 'os veículos' : atrasados[0].veiculo === 'moto' ? 'a moto' : 'o carro'}?`,
      texto: `Faz ${maior} dias desde o último abastecimento ${nomes}.`,
    });

    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload, { TTL: 86_400 },
      );
      await db.from('push_subscriptions')
        .update({ ultimo_aviso: new Date().toISOString() }).eq('endpoint', s.endpoint);
      enviados++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        removidos++;
      } else {
        console.error('Falha ao enviar push', code, e);
      }
    }
  }

  return Response.json({ inscricoes: subs?.length ?? 0, enviados, removidos, pulados });
});
