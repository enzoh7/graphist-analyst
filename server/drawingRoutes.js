import express from 'express';
import { Drawing } from './models.js';
import { authenticateToken } from './authRoutes.js';

const router = express.Router();

// ========== GET /drawings?symbol=EURUSD&timeframe=1h ==========
router.get('/drawings', authenticateToken, async (req, res) => {
  try {
    const { symbol, timeframe, limit = 100 } = req.query;

    // ========== CONSTRUCTION DE LA REQUÊTE ==========
    const query = {
      userId: req.user.id,
      isArchived: false
    };

    if (symbol) {
      query.symbol = symbol;
    }

    if (timeframe) {
      query.timeframe = timeframe;
    }

    // ========== RÉCUPÉRER LES DESSINS ==========
    const drawings = await Drawing.find(query)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    console.log(`✅ Dessins récupérés pour ${req.user.email}: ${drawings.length}`);

    res.json({
      success: true,
      drawings: drawings
    });

  } catch (error) {
    console.error('❌ Erreur récupération dessins:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des dessins'
    });
  }
});

// ========== POST /drawings ==========
router.post('/drawings', authenticateToken, async (req, res) => {
  try {
    const { type, symbol, timeframe, p1, p2, color, textColor, text, textPos, textSize } = req.body;

    // ========== VALIDATION ==========
    if (!type || !symbol || !timeframe || !p1 || !['hline', 'rect', 'position', 'fib'].includes(type)) {
      return res.status(400).json({
        error: 'Paramètres invalides ou manquants'
      });
    }

    if (!p1.price || typeof p1.price !== 'number') {
      return res.status(400).json({
        error: 'Prix P1 invalide'
      });
    }

    if (p2 && (!p2.price || typeof p2.price !== 'number')) {
      return res.status(400).json({
        error: 'Prix P2 invalide'
      });
    }

    // ========== CRÉER LE DESSIN ==========
    const newDrawing = new Drawing({
      userId: req.user.id,
      type: type,
      symbol: symbol.toUpperCase(),
      timeframe: timeframe,
      p1: p1,
      p2: p2 || null,
      color: color || '#2962ff',
      textColor: textColor || '#ffffff',
      text: text || '',
      textPos: textPos || 'middle',
      textSize: textSize || 12
    });

    await newDrawing.save();

    console.log(`✅ Dessin créé: ${type} sur ${symbol} ${timeframe}`);

    res.status(201).json({
      success: true,
      drawing: newDrawing
    });

  } catch (error) {
    console.error('❌ Erreur création dessin:', error);
    res.status(500).json({
      error: 'Erreur lors de la création du dessin'
    });
  }
});

// ========== PUT /drawings/:id ==========
router.put('/drawings/:id', authenticateToken, async (req, res) => {
  try {
    const { p1, p2, color, textColor, text, textPos, textSize } = req.body;

    // ========== VÉRIFIER PROPRIÉTÉ ==========
    const drawing = await Drawing.findById(req.params.id);

    if (!drawing) {
      return res.status(404).json({
        error: 'Dessin non trouvé'
      });
    }

    if (drawing.userId.toString() !== req.user.id) {
      return res.status(403).json({
        error: 'Accès refusé'
      });
    }

    // ========== METTRE À JOUR ==========
    if (p1) drawing.p1 = p1;
    if (p2) drawing.p2 = p2;
    if (color) drawing.color = color;
    if (textColor) drawing.textColor = textColor;
    if (text !== undefined) drawing.text = text;
    if (textPos) drawing.textPos = textPos;
    if (textSize) drawing.textSize = textSize;

    drawing.updatedAt = new Date();
    await drawing.save();

    console.log(`✅ Dessin mis à jour: ${req.params.id}`);

    res.json({
      success: true,
      drawing: drawing
    });

  } catch (error) {
    console.error('❌ Erreur mise à jour dessin:', error);
    res.status(500).json({
      error: 'Erreur lors de la mise à jour du dessin'
    });
  }
});

// ========== DELETE /drawings/:id ==========
router.delete('/drawings/:id', authenticateToken, async (req, res) => {
  try {
    // ========== VÉRIFIER PROPRIÉTÉ ==========
    const drawing = await Drawing.findById(req.params.id);

    if (!drawing) {
      return res.status(404).json({
        error: 'Dessin non trouvé'
      });
    }

    if (drawing.userId.toString() !== req.user.id) {
      return res.status(403).json({
        error: 'Accès refusé'
      });
    }

    // ========== SOFT DELETE ==========
    drawing.isArchived = true;
    await drawing.save();

    console.log(`✅ Dessin archivé: ${req.params.id}`);

    res.json({
      success: true,
      message: 'Dessin supprimé'
    });

  } catch (error) {
    console.error('❌ Erreur suppression dessin:', error);
    res.status(500).json({
      error: 'Erreur lors de la suppression du dessin'
    });
  }
});

// ========== POST /drawings/bulk-save ==========
router.post('/drawings/bulk-save', authenticateToken, async (req, res) => {
  try {
    const { drawings } = req.body;

    if (!Array.isArray(drawings)) {
      return res.status(400).json({
        error: 'Drawings doit être un array'
      });
    }

    // Valider chaque dessin
    for (const d of drawings) {
      if (!d.type || !d.symbol || !d.timeframe || !d.p1) {
        return res.status(400).json({
          error: 'Paramètres invalides'
        });
      }
    }

    // ========== SAUVEGARDER EN MASSE ==========
    const savedDrawings = [];
    for (const d of drawings) {
      const drawing = new Drawing({
        userId: req.user.id,
        type: d.type,
        symbol: d.symbol.toUpperCase(),
        timeframe: d.timeframe,
        p1: d.p1,
        p2: d.p2 || null,
        color: d.color || '#2962ff',
        textColor: d.textColor || '#ffffff',
        text: d.text || '',
        textPos: d.textPos || 'middle',
        textSize: d.textSize || 12
      });
      await drawing.save();
      savedDrawings.push(drawing);
    }

    console.log(`✅ ${savedDrawings.length} dessins sauvegardés en masse`);

    res.status(201).json({
      success: true,
      count: savedDrawings.length,
      drawings: savedDrawings
    });

  } catch (error) {
    console.error('❌ Erreur sauvegarde en masse:', error);
    res.status(500).json({
      error: 'Erreur lors de la sauvegarde des dessins'
    });
  }
});

// ========== GET /drawings/stats ==========
router.get('/drawings/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await Drawing.aggregate([
      { $match: { userId: req.user.id, isArchived: false } },
      {
        $group: {
          _id: '$symbol',
          count: { $sum: 1 },
          types: { $push: '$type' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('❌ Erreur stats:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des stats'
    });
  }
});

export default router;
