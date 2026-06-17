const axios = require('axios');
const crypto = require('crypto');
const { getDb, logActivity } = require('../models/database');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || ''; // e.g., PLN_xxxxxxxx

const paymentController = {
    async initialize(req, res) {
        try {
            if (!PAYSTACK_SECRET_KEY) {
                return res.status(500).json({ error: 'Paystack integration is not configured on the server. PAYSTACK_SECRET_KEY is missing.' });
            }

            const email = req.user.email;
            const callbackUrl = `${req.protocol}://${req.get('host')}/whatsapp`; // redirect to dashboard

            // Paystack Initialize Transaction API (for plans, it automatically registers subscription)
            const paystackPayload = {
                email,
                amount: '500000', // e.g., 5,000 NGN (expressed in kobo: 5000 * 100)
                callback_url: callbackUrl
            };

            if (PAYSTACK_PLAN_CODE) {
                paystackPayload.plan = PAYSTACK_PLAN_CODE;
            }

            console.log('[Paystack] Initializing payment transaction...', paystackPayload);

            const response = await axios.post(
                'https://api.paystack.co/transaction/initialize',
                paystackPayload,
                {
                    headers: {
                        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            res.json({
                authorization_url: response.data.data.authorization_url,
                reference: response.data.data.reference
            });
        } catch (err) {
            console.error('[Payment Initialize] Error:', err.response?.data || err.message);
            res.status(500).json({ error: err.response?.data?.message || 'Failed to initialize subscription checkout' });
        }
    },

    async webhook(req, res) {
        try {
            // Verify Paystack Event Signature
            const signature = req.headers['x-paystack-signature'];
            if (!signature) {
                return res.status(401).json({ error: 'No paystack signature header' });
            }

            if (!PAYSTACK_SECRET_KEY) {
                return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY is missing' });
            }

            const hash = crypto
                .createHmac('sha512', PAYSTACK_SECRET_KEY)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (hash !== signature) {
                console.error('[Paystack Webhook] Signature mismatch error!');
                return res.status(401).json({ error: 'Invalid signature mismatch' });
            }

            const event = req.body;
            console.log(`[Paystack Webhook] Received event: ${event.event}`, event.data);

            const db = await getDb();

            // Extract customer details
            const customerEmail = event.data.customer?.email;
            if (!customerEmail) {
                console.warn('[Paystack Webhook] Customer email missing in webhook payload');
                return res.sendStatus(200);
            }

            const user = await db.get('SELECT id FROM users WHERE email = ?', [customerEmail]);
            if (!user) {
                console.warn(`[Paystack Webhook] No user found with email: ${customerEmail}`);
                return res.sendStatus(200);
            }

            switch (event.event) {
                case 'subscription.create':
                case 'charge.success':
                    // Activate subscription and upgrade to premium tier
                    await db.run(
                        `UPDATE users SET subscription_status = 'active', tier = 'premium', trial_ends_at = NULL, paystack_customer_code = ?, paystack_subscription_code = ? WHERE id = ?`,
                        [
                            event.data.customer.customer_code || null,
                            event.data.subscription_code || null,
                            user.id
                        ]
                    );
                    await logActivity('subscription_activated', `Subscription upgraded to Premium via Paystack webhook`, user.id);
                    console.log(`[Paystack] Upgraded & activated subscription for ${customerEmail}`);
                    break;

                case 'subscription.disable':
                    // Disable subscription
                    await db.run(
                        `UPDATE users SET subscription_status = 'inactive', paystack_subscription_code = NULL WHERE id = ?`,
                        [user.id]
                    );
                    await logActivity('subscription_disabled', `Subscription disabled/cancelled via Paystack webhook`, user.id);
                    console.log(`[Paystack] Disabled subscription for ${customerEmail}`);
                    break;

                default:
                    console.log(`[Paystack Webhook] Ignored unhandled event: ${event.event}`);
            }

            res.sendStatus(200);
        } catch (err) {
            console.error('[Paystack Webhook] Error processing webhook:', err);
            res.status(500).json({ error: 'Webhook handler error' });
        }
    },

    async startTrial(req, res) {
        try {
            const db = await getDb();
            const user = await db.get('SELECT tier, trial_ends_at FROM users WHERE id = ?', [req.user.id]);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (user.trial_ends_at) {
                return res.status(400).json({ error: 'You have already used or started your Free Trial.' });
            }

            const trialEndsAt = new Date();
            trialEndsAt.setDate(trialEndsAt.getDate() + 14);

            await db.run(
                "UPDATE users SET tier = 'trial', subscription_status = 'active', trial_ends_at = ? WHERE id = ?",
                [trialEndsAt.toISOString(), req.user.id]
            );

            await logActivity('trial_started', `Started 14-day free trial`, req.user.id);

            res.json({
                message: 'Trial started successfully',
                tier: 'trial',
                trial_ends_at: trialEndsAt.toISOString()
            });
        } catch (err) {
            console.error('[Start Trial] Error:', err);
            res.status(500).json({ error: 'Failed to start trial' });
        }
    }
};

module.exports = paymentController;
