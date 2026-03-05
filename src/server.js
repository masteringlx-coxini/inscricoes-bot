import express from 'express';                                               
   import dotenv from 'dotenv';                                                 
   import Stripe from 'stripe';                                                 
   import nodemailer from 'nodemailer';                                         
                                                                                
   dotenv.config();                                                             
                                                                                
   const app = express();                                                       
   const port = process.env.PORT || 3000;                                       
                                                                                
   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);                   
                                                                                
   const transporter = nodemailer.createTransport({                             
   host: process.env.SMTP_HOST || 'smtp.gmail.com',                             
   port: Number(process.env.SMTP_PORT || 465),                                  
   secure: true,                                                                
   auth: {                                                                      
   user: process.env.SMTP_USER,                                                 
   pass: process.env.SMTP_PASS,                                                 
   },                                                                           
   });                                                                          
                                                                                
   app.get('/health', (req, res) => {                                           
   res.json({ ok: true, service: 'inscricoes-bot' });                           
   });                                                                          
                                                                                
   app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async 
  (req, res) => {                                                               
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
                                                                                
   const amountCents = Number(session.amount_total || 0);                       
   const amount = amountCents / 100;                                            
   const currency = (session.currency || '').toLowerCase();                     
   const email = session.customer_details?.email || session.customer_email ||   
 'sem-email';                                                                   
                                                                                
   console.log('✅ Pagamento confirmado:', {                                    
   sessionId: session.id,                                                       
   amount,                                                                      
   amountCents,                                                                 
   currency,                                                                    
   email,                                                                       
   mode: session.mode,                                                          
   metadata: session.metadata || {},                                            
   });                                                                          
                                                                                
   const calendarUrl = process.env.INTERVIEW_CALENDAR_URL ||                    
 'https://calendly.com/';                                                       
                                                                                
   if (email !== 'sem-email' && process.env.SMTP_USER && process.env.SMTP_PASS) 
 {                                                                              
   const metadataFlow = String(session.metadata?.flow || '').toLowerCase();     
   const isInterviewFee =                                                       
   metadataFlow === 'interview_fee' ||                                          
   metadataFlow === 'entrevista' ||                                             
   (currency === 'eur' && amountCents === 1000);                                
                                                                                
   const subject = isInterviewFee                                               
   ? 'Pagamento confirmado — Entrevista Mastering Lisboa'                       
   : 'Pagamento confirmado — Curso Mastering Lisboa';                           
                                                                                
   const html = isInterviewFee                                                  
   ? `                                                                          
   <h2>Pagamento confirmado ✅</h2>                                             
   <p>Recebemos o teu pagamento de <strong>10€</strong> para a entrevista.</p>  
   <p>Próximo passo: agenda a tua entrevista aqui:</p>                          
   <p><a href="${calendarUrl}">${calendarUrl}</a></p>                           
   <p>Até já,<br/>Mastering Lisboa</p>                                          
   `                                                                            
   : `                                                                          
   <h2>Inscrição confirmada ✅</h2>                                             
   <p>Recebemos o teu pagamento final do curso.</p>                             
   <p>Ficaste oficialmente inscrito/a.</p>                                      
   <p>Até já,<br/>Mastering Lisboa</p>                                          
   `;                                                                           
                                                                                
   try {                                                                        
   await transporter.sendMail({                                                 
   from: process.env.SMTP_FROM || process.env.SMTP_USER,                        
   to: email,                                                                   
   subject,                                                                     
   html,                                                                        
   });                                                                          
   console.log('📧 Email enviado para', email);                                 
   } catch (mailErr) {                                                          
   console.error('❌ Erro ao enviar email:', mailErr.message);                  
   }                                                                            
                                                                                
   // Notificação interna para o Hugo quando entra nova inscrição de entrevista 
   if (isInterviewFee && process.env.ADMIN_NOTIFY_EMAIL) {                      
   const adminSubject = 'Nova inscrição para entrevista — Mastering Lisboa';    
   const adminHtml = `                                                          
   <h2>Nova inscrição para entrevista 🎯</h2>                                   
   <p><strong>Email do aluno:</strong> ${email}</p>                             
   <p><strong>Nome:</strong> ${session.customer_details?.name || 'N/D'}</p>     
   <p><strong>Valor:</strong> ${amount} ${currency.toUpperCase()}</p>           
   <p><strong>Session ID:</strong> ${session.id}</p>                            
   <p><strong>Data:</strong> ${new Date().toISOString()}</p>                    
   `;                                                                           
                                                                                
   try {                                                                        
   await transporter.sendMail({                                                 
   from: process.env.SMTP_FROM || process.env.SMTP_USER,                        
   to: process.env.ADMIN_NOTIFY_EMAIL,                                          
   subject: adminSubject,                                                       
   html: adminHtml,                                                             
   });                                                                          
   console.log('📨 Notificação interna enviada para',                           
 process.env.ADMIN_NOTIFY_EMAIL);                                               
   } catch (adminErr) {                                                         
   console.error('❌ Erro ao enviar notificação interna:', adminErr.message);   
   }                                                                            
   }                                                                            
   } else {                                                                     
   console.log('ℹ️ SMTP não configurado; email não enviado.');                  
   }                                                                            
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
