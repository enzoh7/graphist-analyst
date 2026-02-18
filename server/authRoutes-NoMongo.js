import express from 'express';
import jwt from 'jsonwebtoken';
import validator from 'validator';
import bcryptjs from 'bcryptjs';

const router = express.Router();

// ========== CONFIGURATION JWT ==========
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

// ========== PSEUDO-DATABASE (En Mémoire - pour tests sans MongoDB) ==========
const usersDB = new Map();
const drawingsDB = new Map();
let userIdCounter = 1;
let drawingIdCounter = 1;

// ========== MIDDLEWARE: Vérifier JWT ==========
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Token manquant'
      });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({
          error: 'Token invalide ou expiré'
        });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erreur d\'authentification'
    });
  }
};

// ========== ROUTE: Inscription ==========
router.post('/signup', async (req, res) => {
  try {
    const { email, password, passwordConfirm, username } = req.body;

    // ========== VALIDATION ==========
    if (!email || !password || !passwordConfirm) {
      return res.status(400).json({
        error: 'Email et mot de passe requis'
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        error: 'Email invalide'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Le mot de passe doit contenir au moins 8 caractères'
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({
        error: 'Les mots de passe ne correspondent pas'
      });
    }

    // ========== VÉRIFIER EMAIL EXISTE ==========
    const existingUser = Array.from(usersDB.values()).find(u => u.email === email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({
        error: 'Cet email est déjà utilisé'
      });
    }

    // ========== HACHER LE PASSWORD ==========
    const hashedPassword = await bcryptjs.hash(password, 10);

    // ========== CRÉER L'UTILISATEUR ==========
    const userId = String(userIdCounter++);
    const newUser = {
      id: userId,
      email: email.toLowerCase(),
      username: username || email.split('@')[0],
      password: hashedPassword,
      preferences: {
        notifyEconomicNews: true,
        allowEconomicExplanations: true,
        theme: 'dark'
      },
      brokerConfigured: false,
      createdAt: new Date()
    };

    usersDB.set(userId, newUser);

    // ========== GÉNÉRER JWT ==========
    const token = jwt.sign(
      {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log(`✅ Utilisateur créé: ${email}`);

    res.status(201).json({
      success: true,
      token: token,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        brokerConfigured: newUser.brokerConfigured
      }
    });

  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'inscription',
      details: error.message
    });
  }
});

// ========== ROUTE: Connexion ==========
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // ========== VALIDATION ==========
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email et mot de passe requis'
      });
    }

    // ========== CHERCHER L'UTILISATEUR ==========
    const user = Array.from(usersDB.values()).find(u => u.email === email.toLowerCase());

    if (!user) {
      return res.status(401).json({
        error: 'Email ou mot de passe invalide'
      });
    }

    // ========== COMPARER LES MOTS DE PASSE ==========
    const isPasswordValid = await bcryptjs.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Email ou mot de passe invalide'
      });
    }

    // ========== GÉNÉRER JWT ==========
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log(`✅ Connexion: ${email}`);

    res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        brokerConfigured: user.brokerConfigured
      }
    });

  } catch (error) {
    console.error('❌ Erreur connexion:', error);
    res.status(500).json({
      error: 'Erreur lors de la connexion'
    });
  }
});

// ========== ROUTE: Récupérer profil ==========
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = usersDB.get(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        preferences: user.preferences,
        brokerConfigured: user.brokerConfigured
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Erreur lors de la récupération du profil'
    });
  }
});

// ========== ROUTE: Mettre à jour préférences ==========
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const user = usersDB.get(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé'
      });
    }

    const { notifyEconomicNews, allowEconomicExplanations, theme } = req.body;

    if (notifyEconomicNews !== undefined) user.preferences.notifyEconomicNews = notifyEconomicNews;
    if (allowEconomicExplanations !== undefined) user.preferences.allowEconomicExplanations = allowEconomicExplanations;
    if (theme !== undefined) user.preferences.theme = theme;

    res.json({
      success: true,
      preferences: user.preferences
    });

  } catch (error) {
    res.status(500).json({
      error: 'Erreur lors de la mise à jour des préférences'
    });
  }
});

// ========== ROUTE: Configurer le broker ==========
router.post('/broker-config', authenticateToken, async (req, res) => {
  try {
    const { metaApiToken, accountId } = req.body;

    const user = usersDB.get(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé'
      });
    }

    // Validation du token
    if (!metaApiToken || metaApiToken.trim().length < 10) {
      return res.status(400).json({
        error: 'Token MetaApi invalide (min 10 caractères)'
      });
    }

    if (!accountId || accountId.trim().length < 5) {
      return res.status(400).json({
        error: 'ID du compte invalide'
      });
    }

    user.brokerToken = metaApiToken;
    user.brokerAccountId = accountId;
    user.brokerConfigured = true;
    user.brokerConnected = true;
    user.brokerConnectedAt = new Date().toISOString();

    console.log(`✅ Broker configuré pour ${user.email} - Account: ${accountId}`);

    res.json({
      success: true,
      brokerConfigured: user.brokerConfigured,
      brokerConnected: user.brokerConnected,
      brokerAccountId: user.brokerAccountId
    });

  } catch (error) {
    console.error('❌ Erreur config broker:', error);
    res.status(500).json({
      error: 'Erreur lors de la configuration du broker'
    });
  }
});

// ========== ROUTE: Vérifier la connexion broker ==========
router.get('/broker-status', authenticateToken, (req, res) => {
  try {
    const user = usersDB.get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({
      brokerConfigured: user.brokerConfigured || false,
      brokerConnected: user.brokerConnected || false,
      brokerAccountId: user.brokerAccountId || null,
      brokerName: 'MexAtlantic-Real',
      brokerConnectedAt: user.brokerConnectedAt || null
    });

  } catch (error) {
    res.status(500).json({ error: 'Erreur vérification broker' });
  }
});

// ========== ROUTE: Déconnexion ==========
router.post('/logout', authenticateToken, async (req, res) => {
  res.json({
    success: true,
    message: 'Déconnecté'
  });
});

// ========== ROUTE DE DEBUG: Voir tous les utilisateurs ==========
router.get('/debug/users', (req, res) => {
  const publicUsers = Array.from(usersDB.values()).map(u => ({
    id: u.id,
    email: u.email,
    username: u.username,
    createdAt: u.createdAt
  }));
  res.json({
    users: publicUsers,
    count: publicUsers.length
  });
});

export default router;
