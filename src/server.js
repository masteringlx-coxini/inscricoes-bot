import express from 'express';
import dotenv from 'dotenv';
import Stripe from 'stripe';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function sendEmailResend({ to, subject, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: [to],
      subject,
      html,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Resend error ${resp.status}: ${txt}`);
  }

  return resp.json();
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'inscricoes-bot' });
});

app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Stripe signature inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const amountCents = Number(session.amount_total || 0);
      const amount = amountCents / 100;
      const currency = (session.currency || '').toLowerCase();
      const email = session.customer_details?.email || session.customer_email || 'sem-email';

      console.log('✅ Pagamento confirmado:', {
        sessionId: session.id,
        amount,
        amountCents,
        currency,
        email,
        mode: session.mode,
        metadata: session.metadata || {},
      });

      const zoomUrl = process.env.INTERVIEW_ZOOM_URL || 'https://us06web.zoom.us/j/83523224795?pwd=UjRnSzJncENkbVNhSFJiNzFUUFBHUT09';
      const metadataFlow = String(session.metadata?.flow || '').toLowerCase();
      const isInterviewFee =
        metadataFlow === 'interview_fee' ||
        metadataFlow === 'entrevista' ||
        (currency === 'eur' && amountCents === 1000);

      if (email !== 'sem-email' && process.env.RESEND_API_KEY) {
        const subject = isInterviewFee
          ? 'Pagamento confirmado — Entrevista Mastering Lisboa'
          : 'Pagamento confirmado — Curso Mastering Lisboa';

        const html = isInterviewFee
          ? `
            <h2>Pagamento confirmado ✅</h2>
            <p>Recebemos o teu pagamento de <strong>10€</strong> para a entrevista.</p>
            <p>Responde a este email com <strong>2 ou 3 opções de horário</strong>.</p>
            <p><strong>Disponibilidade:</strong> segunda a sexta, das 09:00 às 17:00 (hora de Lisboa).</p>
            <p><strong>Link Zoom da entrevista:</strong><br/><a href="${zoomUrl}">${zoomUrl}</a></p>
            <p>Assim que recebermos a tua resposta, confirmamos o horário final.</p>
            <p>Até já,<br/>Mastering Lisboa</p>
          `
          : `
            <h2>Inscrição confirmada ✅</h2>
            <p>Recebemos o teu pagamento final do curso.</p>
            <p>Ficaste oficialmente inscrito/a.</p>
            <p>Até já,<br/>Mastering Lisboa</p>
          `;

        try {
          await sendEmailResend({ to: email, subject, html });
          console.log('📧 Email enviado para', email);
        } catch (mailErr) {
          console.error('❌ Erro ao enviar email:', mailErr.message);
        }

        if (isInterviewFee && process.env.ADMIN_NOTIFY_EMAIL) {
          try {
            await sendEmailResend({
              to: process.env.ADMIN_NOTIFY_EMAIL,
              subject: 'Nova inscrição para entrevista — Mastering Lisboa',
              html: `
                <h2>Nova inscrição para entrevista 🎯</h2>
                <p><strong>Email do aluno:</strong> ${email}</p>
                <p><strong>Nome:</strong> ${session.customer_details?.name || 'N/D'}</p>
                <p><strong>Valor:</strong> ${amount} ${currency.toUpperCase()}</p>
                <p><strong>Session ID:</strong> ${session.id}</p>
              `,
            });
            console.log('📨 Notificação interna enviada para', process.env.ADMIN_NOTIFY_EMAIL);
          } catch (adminErr) {
            console.error('❌ Erro ao enviar notificação interna:', adminErr.message);
          }
        }
      } else {
        console.log('ℹ️ RESEND_API_KEY não configurada; email não enviado.');
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('❌ Erro ao processar evento:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.use(express.json());

app.listen(port, () => {
  console.log(`🚀 inscricoes-bot ativo em http://localhost:${port}`);
});
