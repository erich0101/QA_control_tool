const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../../db');
const { JWT_SECRET } = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await query(`SELECT * FROM qa_users WHERE email = ?`, [email]);
        const user = result.rows[0];
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email, perfil: user.perfil || 'user' }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true });
        res.json({ ok: true, user: { id: user.id, name: user.name, role: user.role, perfil: user.perfil || 'user' } });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/me', requireAuth, async (req, res) => {
    try {
        const perms = await query(`SELECT * FROM qa_user_permissions WHERE user_id = ?`, [req.user.id]);
        res.json({ user: req.user, permissions: perms.rows[0] });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ ok: true });
});

module.exports = router;
