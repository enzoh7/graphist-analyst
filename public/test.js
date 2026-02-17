// Tests de la plateforme de trading
// Exécuter ceci dans la console du navigateur (F12)

console.log('=== TESTS DE LA PLATEFORME ===\n');

// Test 1 : Vérifier les éléments HTML
console.log('1️⃣ VÉRIFICATION DES ÉLÉMENTS HTML');
const elements = {
    'Barre d\'outils': '#main-toolbar',
    'Buttons d\'outils': '.tool-btn',
    'Sélecteur d\'asset': '#asset-select',
    'Boutons timeframe': '.tf-btn',
    'Conteneur graphique': '#chart-container',
    'Overlay': '#drawing-settings-overlay',
};

Object.entries(elements).forEach(([name, selector]) => {
    const el = document.querySelector(selector);
    console.log(`${el ? '✅' : '❌'} ${name}: ${el ? 'TROUVÉ' : 'MANQUANT'}`);
});

// Test 2 : Vérifier les styles CSS
console.log('\n2️⃣ VÉRIFICATION DES STYLES CSS');
const body = document.body;
const bodyStyle = window.getComputedStyle(body);
console.log(`✅ Background: ${bodyStyle.backgroundColor}`);
console.log(`✅ Font-family: ${bodyStyle.fontFamily}`);

const container = document.getElementById('chart-container');
if (container) {
    const containerStyle = window.getComputedStyle(container);
    console.log(`✅ Conteneur dimensions: ${container.clientWidth}x${container.clientHeight}px`);
    console.log(`✅ Conteneur flex: ${containerStyle.flex}`);
}

// Test 3 : Vérifier les classes disponibles
console.log('\n3️⃣ VÉRIFICATION DES BOUTONS D\'OUTILS');
document.querySelectorAll('.tool-btn').forEach(btn => {
    console.log(`✅ ${btn.id}: ${btn.textContent.trim()}`);
});

// Test 4 : Tester l'écoute des événements
console.log('\n4️⃣ TEST DES ÉVÉNEMENTS');
let toolClicked = false;
const cursorBtn = document.getElementById('tool-cursor');
if (cursorBtn) {
    cursorBtn.addEventListener('click', () => {
        console.log('✅ Clic sur bouton curseur détecté');
        toolClicked = true;
    });
    console.log('✅ Event listener ajouté au bouton curseur');
}

// Test 5 : Vérifier window.lightweight-charts
console.log('\n5️⃣ VÉRIFICATION DES MODULES');
console.log(`lightweight-charts disponible: ${typeof window.LightweightCharts !== 'undefined'}`);

// Test 6 : Afficher les variables globales créées
console.log('\n6️⃣ VARIABLES GLOBALES');
console.log(`Objet window.initPlatform: ${typeof window.initPlatform}`);

console.log('\n=== TESTS TERMINÉS ===');
console.log('\n💡 PROCHAINES ÉTAPES:');
console.log('1. Attendez que le graphique se charge (vérifiez les messages console)');
console.log('2. Essayez de cliquer sur les boutons d\'outils');
console.log('3. Essayez de cliquer sur le graphique pour tracer un rectangle');
console.log('4. Vérifiez que l\'overlay s\'ouvre en cliquant sur le rectangle');
