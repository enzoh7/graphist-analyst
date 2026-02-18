import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

// ========== SCHÉMA UTILISATEUR ==========
const userSchema = new mongoose.Schema({
  // Identité
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Email invalide'
    }
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false // Ne pas retourner le password par défaut
  },

  // Profil
  username: {
    type: String,
    sparse: true,
    unique: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },

  // Broker MetaApi (optionnel)
  brokerConfig: {
    metaApiToken: {
      type: String,
      select: false // Ne pas retourner les credentials par défaut
    },
    accountId: {
      type: String,
      select: false
    },
    isConfigured: {
      type: Boolean,
      default: false
    }
  },

  // Préférences utilisateur
  preferences: {
    // Notifications économiques
    notifyEconomicNews: {
      type: Boolean,
      default: true
    },
    allowEconomicExplanations: {
      type: Boolean,
      default: true
    },
    // Autres préférences
    theme: {
      type: String,
      enum: ['dark', 'light'],
      default: 'dark'
    },
    candleType: {
      type: String,
      enum: ['candlestick', 'bar'],
      default: 'candlestick'
    }
  },

  // Sécurité
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date // Pour brute-force protection
}, {
  timestamps: true
});

// ========== HOOKS ==========

// Hash password avant de sauvegarder
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcryptjs.genSalt(10);
    this.password = await bcryptjs.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour comparer password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcryptjs.compare(candidatePassword, this.password);
};

// ========== SCHÉMA DESSIN ==========
const drawingSchema = new mongoose.Schema({
  // Référence à l'utilisateur
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Données du dessin
  type: {
    type: String,
    enum: ['hline', 'rect', 'position', 'fib'],
    required: true
  },
  symbol: {
    type: String,
    required: true, // Ex: "EURUSD"
    index: true
  },
  timeframe: {
    type: String,
    required: true // Ex: "1h", "4h", "1d"
  },

  // Points du dessin
  p1: {
    type: {
      time: mongoose.Schema.Types.Mixed,
      price: Number
    },
    required: true
  },
  p2: {
    type: {
      time: mongoose.Schema.Types.Mixed,
      price: Number
    }
  },

  // Style
  color: {
    type: String,
    default: '#2962ff',
    validate: {
      validator: function (v) {
        return /^#[0-9A-F]{6}$/i.test(v);
      },
      message: 'Couleur invalide'
    }
  },
  textColor: {
    type: String,
    default: '#ffffff'
  },

  // Texte et position
  text: {
    type: String,
    default: '',
    maxlength: 200
  },
  textPos: {
    type: String,
    enum: ['top', 'middle', 'bottom'],
    default: 'middle'
  },
  textSize: {
    type: Number,
    min: 8,
    max: 32,
    default: 12
  },

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index composé pour recherche rapide
drawingSchema.index({ userId: 1, symbol: 1, timeframe: 1 });

// ========== MODÈLES ==========
const User = mongoose.model('User', userSchema);
const Drawing = mongoose.model('Drawing', drawingSchema);

export { User, Drawing };
