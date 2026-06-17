const { getDb, logActivity } = require('../models/database');

const planController = {
    // Public: list active plans for subscription page
    async listActivePlans(req, res) {
        try {
            const db = await getDb();
            const plans = await db.all(
                'SELECT id, name, slug, price, duration_days, max_groups, max_sessions, spam_interval_hours, is_trial FROM subscription_plans WHERE is_active = 1 ORDER BY price ASC'
            );
            res.json({ plans });
        } catch (err) {
            console.error('[Plans] Error listing active plans:', err);
            res.status(500).json({ error: 'Failed to fetch subscription plans' });
        }
    },

    // Admin: list ALL plans
    async listAllPlans(req, res) {
        try {
            const db = await getDb();
            const plans = await db.all('SELECT * FROM subscription_plans ORDER BY created_at ASC');
            res.json({ plans });
        } catch (err) {
            console.error('[Plans] Error listing all plans:', err);
            res.status(500).json({ error: 'Failed to fetch plans' });
        }
    },

    // Admin: create plan
    async createPlan(req, res) {
        try {
            const { name, slug, price, duration_days, max_groups, max_sessions, spam_interval_hours, paystack_plan_code, is_trial } = req.body;

            if (!name || !slug) {
                return res.status(400).json({ error: 'Plan name and slug are required.' });
            }

            const db = await getDb();

            // Check slug uniqueness
            const existing = await db.get('SELECT id FROM subscription_plans WHERE slug = ?', [slug]);
            if (existing) {
                return res.status(400).json({ error: `A plan with slug "${slug}" already exists.` });
            }

            const result = await db.run(
                `INSERT INTO subscription_plans (name, slug, price, duration_days, max_groups, max_sessions, spam_interval_hours, paystack_plan_code, is_trial)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    name,
                    slug.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                    price || 0,
                    duration_days || 30,
                    max_groups || 3,
                    max_sessions || 1,
                    spam_interval_hours || 12,
                    paystack_plan_code || null,
                    is_trial ? 1 : 0
                ]
            );

            await logActivity('plan_created', `Admin created subscription plan: ${name}`, req.user.id);
            console.log(`[Plans] Created plan: ${name} (${slug})`);

            res.json({ message: 'Plan created successfully', planId: result.lastID });
        } catch (err) {
            console.error('[Plans] Error creating plan:', err);
            res.status(500).json({ error: 'Failed to create plan' });
        }
    },

    // Admin: update plan
    async updatePlan(req, res) {
        try {
            const { id } = req.params;
            const { name, price, duration_days, max_groups, max_sessions, spam_interval_hours, paystack_plan_code, is_trial, is_active } = req.body;

            const db = await getDb();
            const plan = await db.get('SELECT * FROM subscription_plans WHERE id = ?', [id]);
            if (!plan) {
                return res.status(404).json({ error: 'Plan not found' });
            }

            await db.run(
                `UPDATE subscription_plans SET 
                    name = ?, price = ?, duration_days = ?, max_groups = ?, max_sessions = ?, 
                    spam_interval_hours = ?, paystack_plan_code = ?, is_trial = ?, is_active = ?
                 WHERE id = ?`,
                [
                    name ?? plan.name,
                    price ?? plan.price,
                    duration_days ?? plan.duration_days,
                    max_groups ?? plan.max_groups,
                    max_sessions ?? plan.max_sessions,
                    spam_interval_hours ?? plan.spam_interval_hours,
                    paystack_plan_code ?? plan.paystack_plan_code,
                    is_trial !== undefined ? (is_trial ? 1 : 0) : plan.is_trial,
                    is_active !== undefined ? (is_active ? 1 : 0) : plan.is_active,
                    id
                ]
            );

            await logActivity('plan_updated', `Admin updated plan: ${name || plan.name}`, req.user.id);
            console.log(`[Plans] Updated plan #${id}: ${name || plan.name}`);

            res.json({ message: 'Plan updated successfully' });
        } catch (err) {
            console.error('[Plans] Error updating plan:', err);
            res.status(500).json({ error: 'Failed to update plan' });
        }
    },

    // Admin: delete (soft-delete) plan
    async deletePlan(req, res) {
        try {
            const { id } = req.params;
            const db = await getDb();

            const plan = await db.get('SELECT name, slug FROM subscription_plans WHERE id = ?', [id]);
            if (!plan) {
                return res.status(404).json({ error: 'Plan not found' });
            }

            // Don't allow deleting default trial/premium plans
            if (['trial', 'premium'].includes(plan.slug)) {
                return res.status(400).json({ error: `Cannot delete the default "${plan.name}" plan. You can deactivate it instead.` });
            }

            await db.run('UPDATE subscription_plans SET is_active = 0 WHERE id = ?', [id]);
            await logActivity('plan_deleted', `Admin deactivated plan: ${plan.name}`, req.user.id);

            res.json({ message: 'Plan deactivated successfully' });
        } catch (err) {
            console.error('[Plans] Error deleting plan:', err);
            res.status(500).json({ error: 'Failed to delete plan' });
        }
    }
};

module.exports = planController;
