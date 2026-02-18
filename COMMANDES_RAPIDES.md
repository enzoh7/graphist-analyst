# ⚡ COMMANDES RAPIDES - Démarrage en 5 minutes

## 🚀 Copier-Coller ces commandes dans PowerShell

### TERMINAL 1 : Démarrer le Backend

```powershell
cd C:\wamp64\www\graphist-analyst\server

# 1. Installer les dépendances
npm install

# 2. REMPLIR .env avec vos credentials (voir SETUP_BACKEND.md)
# Ouvrir: server/.env
# - META_API_TOKEN=your_token
# - ACCOUNT_ID=your_id

# 3. Démarrer le serveur
npm run dev
```

**Output attendu:**
```
✅ Compte synchronisé et prêt
🚀 Serveur démarré sur http://localhost:3000
✅ Serveur prêt à recevoir des ordres
```

---

### TERMINAL 2 : Démarrer le Frontend

```powershell
cd C:\wamp64\www\graphist-analyst

# 1. Installer les dépendances (première fois seulement)
npm install

# 2. Démarrer Vite
npm run dev
```

**Output attendu:**
```
  VITE v7.3.1  ready in 123 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h + enter to show help
```

---

## 🎯 Accéder à votre terminal

```
http://localhost:5173
```

**Vérifier:**
- ✅ Le graphique s'affiche
- ✅ Le panneau de trading est visible (bas-droit)
- ✅ Le statut indique "● Connecté" (vert)

---

## 📤 Test rapide : Envoyer une ordem

1. Ouvrir http://localhost:5173
2. Dans le panneau "🎯 Exécution d'Ordre":
   - **Symbole:** EUR/USD
   - **Type:** BUY (☑️)
   - **Volume:** 1.0
   - **Take Profit:** 1.1050
   - **Stop Loss:** 1.0950
3. **Cliquer:** "📤 Envoyer l'Ordre"

**Résultat **
- ✅ Vert = Succès → 'Ordre ID: 12345'
- ❌ Rouge = Erreur → Vérifier les logs du serveur

---

## 🔧 Commandes utiles

### Vérifier le serveur
```powershell
curl http://localhost:3000/health
```

### Arrêter les serveurs
```powershell
# Fermer les terminaux avec Ctrl+C
Ctrl + C
```

### Redémarrer
```powershell
# Dans les mêmes terminaux:
npm start      # Backend
npm run dev    # Frontend
```

---

## ⚠️ Problèmes communs

| Problème | Solution |
|----------|----------|
| "Cannot find module" | `npm install` dans le bon dossier |
| "address already in use" | `Get-Process node \| Stop-Process -Force` |
| "Déconnecté" | Vérifier `.env` - META_API_TOKEN et ACCOUNT_ID |
| "CORS Error" | Vérifier FRONTEND_URL dans `.env` |

---

## 📖 Documentation complète

Pour plus de détails, voir:
- 📄 **SETUP_BACKEND.md** - Installation détaillée
- 📄 **server/README.md** - API Reference
- 📄 **TESTS_GUIDE.md** - Tests personnalisés

---

**Ready to trade! 🚀**
