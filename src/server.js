import express from 'express';
import dotenv from 'dotenv';
import Stripe from 'stripe';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'inscricoes-bot' });
});

app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Stripe signature inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const amount = (session.amount_total || 0) / 100;
      const email = session.customer_details?.email || session.customer_email || 'sem-email';

      console.log('✅ Pagamento confirmado:', {
        sessionId: session.id,
        amount,
        currency: session.currency,
        email,
        mode: session.mode,
      });

      // TODO (passo seguinte):
      // 1) guardar/atualizar candidato na BD
      // 2) estado = interview_fee_paid (para 10€)
      // 3) enviar email de confirmação
      // 4) enviar WhatsApp com link de calendário
      // 5) se for pagamento final do curso => enrolled
    }

    res.json({ received: true });
  } catch (err) {
    console.error('❌ Erro ao processar evento:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// IMPORTANTE: qualquer rota JSON deve vir DEPOIS do webhook raw
app.use(express.json());

app.listen(port, () => {
  console.log(`🚀 inscricoes-bot ativo em http://localhost:${port}`);
});
