const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getTcStatusHistory, getHallazgoStatusHistory, getDefectStatusHistory } = require('../lib/status-history');

const router = express.Router();

// Histórico de estados de un TC a través de todos sus runs/re-tests.
router.get('/tc/:tcId', requireAuth, async (req, res) => {
    try {
        const tcId = parseInt(req.params.tcId, 10);
        if (!tcId) return res.status(400).json({ error: 'tcId inválido' });
        const history = await getTcStatusHistory(tcId);
        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Histórico de estados de un hallazgo.
router.get('/hallazgo/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ error: 'id inválido' });
        const history = await getHallazgoStatusHistory(id);
        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Histórico de estados de un bug/defecto de ejecución.
router.get('/defect/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ error: 'id inválido' });
        const history = await getDefectStatusHistory(id);
        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
