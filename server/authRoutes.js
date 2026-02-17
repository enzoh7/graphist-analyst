import express from 'express';
import jwt from 'jsonwebtoken';
import validator from 'validator';
import { User } from './models.js';

const router = express.Router();

// ========== CONFIGURATION JWT ==========
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

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

    // Valider email
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        error: 'Email invalide'
      });
    }

    // Vérifier les mots de passe
    if (password !== passwordConfirm) {
      return res.status(400).json({
        error: 'Les mots de passe ne correspondent pas'
      });
    }

    // Vérifier longueur mot de passe
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Le mot de passe doit contenir au moins 8 caractères'
      });
    }

    // Vérifier si utilisateur existe déjà
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        error: 'Cet email est déjà utilisé'
      });
    }

    // ========== CRÉATION UTILISATEUR ==========
    const newUser = new User({
      email: email.toLowerCase(),
      password: password,
      username: username || email.split('@')[0]
    });

    await newUser.save();

    console.log(`✅ Nouvel utilisateur créé: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Inscription réussie! Vous pouvez maintenant vous connecter.',
      user: {
        id: newUser._id,
        email: newUser.email,
        username: newUser.username
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

    // Vérifier format email
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        error: 'Email invalide'
      });
    }

    // ========== VÉRIFIER BRUTE-FORCE ==========
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Ne pas révéler si l'email existe
      return res.status(401).json({
        error: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier si compte est verrouillé (brute-force)
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(429).json({
        error: 'Compte temporairement verrouillé. Réessayez plus tard.'
      });
    }

    // ========== VÉRIFIER MOT DE PASSE ==========
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // Incrémenter les tentatives
      user.loginAttempts = (user.loginAttempts || 0) + 1;

      // Verrouiller après 5 tentatives
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        console.warn(`⚠️ Compte verrouillé: ${email} (trop de tentatives)`);
      }

      await user.save();

      return res.status(401).json({
        error: 'Email ou mot de passe incorrect'
      });
    }

    // ========== RÉINITIALISER TENTATIVES ==========
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    // ========== GÉNÉRER JWT ==========
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        username: user.username
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log(`✅ Connexion réussie: ${email}`);

    res.json({
      success: true,
      message: 'Connexion réussie',
      token: token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        brokerConfigured: user.brokerConfig?.isConfigured || false
      }
    });

  } catch (error) {
    console.error('❌ Erreur connexion:', error);
    res.status(500).json({
      error: 'Erreur lors de la connexion',
      details: error.message
    });
  }
});

// ========== ROUTE: Profil utilisateur ==========
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
        preferences: user.preferences,
        brokerConfigured: user.brokerConfig?.isConfigured || false
      }
    });

  } catch (error) {
    console.error('❌ Erreur profil:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération du profil'
    });
  }
});

// ========== ROUTE: Mettre à jour préférences ==========
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const { notifyEconomicNews, allowEconomicExplanations, theme } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          'preferences.notifyEconomicNews': notifyEconomicNews ?? true,
          'preferences.allowEconomicExplanations': allowEconomicExplanations ?? true,
          'preferences.theme': theme || 'dark'
        }
      },
      { new: true }
    );

    console.log(`✅ Préférences mises à jour: ${req.user.email}`);

    res.json({
      success: true,
      preferences: user.preferences
    });

  } catch (error) {
    console.error('❌ Erreur préférences:', error);
    res.status(500).json({
      error: 'Erreur lors de la mise à jour des préférences'
    });
  }
});

// ========== ROUTE: Configurer Broker MetaApi ==========
router.post('/broker-config', authenticateToken, async (req, res) => {
  try {
    const { metaApiToken, accountId } = req.body;

    // ========== VALIDATION ==========
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

    // ========== SAUVEGARDER CREDENTIALS ==========
    // ⚠️ EN PRODUCTION: Chiffer les credentials avec une clé KMS
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          'brokerConfig.metaApiToken': metaApiToken,
          'brokerConfig.accountId': accountId,
          'brokerConfig.isConfigured': true,
          'brokerConfig.configuredAt': new Date()
        }
      },
      { new: true }
    );

    console.log(`✅ Config MetaApi sauvegardée: ${req.user.email} - Account: ${accountId}`);

    res.json({
      success: true,
      brokerConfigured: true,
      brokerConnected: true,
      brokerAccountId: accountId
    });

  } catch (error) {
    console.error('❌ Erreur config broker:', error);
    res.status(500).json({
      error: 'Erreur lors de la configuration du broker'
    });
  }
});

// ========== ROUTE: Vérifier la connexion broker ==========
router.get('/broker-status', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const brokerConfigured = user.brokerConfig?.isConfigured || false;
    const brokerToken = user.brokerConfig?.metaApiToken;
    
    // Vérifier si le token existe et est valide (simple check)
    const brokerConnected = brokerConfigured && brokerToken && brokerToken.length > 10;

    res.json({
      brokerConfigured: brokerConfigured,
      brokerConnected: brokerConnected,
      brokerAccountId: user.brokerConfig?.accountId || null,
      brokerName: 'MexAtlantic-Real',
      brokerConnectedAt: user.brokerConfig?.configuredAt || null
    });

  } catch (error) {
    res.status(500).json({ error: 'Erreur vérification broker' });
  }
});

// ========== ROUTE: Déconnexion ==========
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Avec JWT, la déconnexion côté client suffit (supprimer le token)
    // Optionnellement, on peut blacklister le token dans Redis
    
    console.log(`✅ Déconnexion: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Erreur lors de la déconnexion'
    });
  }
});

export default router;
