import { createClient } from 'redis';
import fs from 'fs';

const redisClient = createClient ({
    url: 'redis://127.0.0.1:6379'
});
redisClient.on('error', (err) => console.error('🚨 Erreur Client Redis :', err));

async function startWorker() {
    try{
        await redisClient.connect();
        console.log('🛡️  Audit Worker démarré. En attente de logs...')

        while(true) {
            try{
                const result = await redisClient.brPop('audit_queue', 0); // Attente a l'infini qu'un log arrive 
                if (result) {
                    
                    const logData = JSON.parse(result.element);
                    console.log('📥 Log reçu pour audit :', logData);
                    
                    const logLine = `[${logData.timestamp}] ${logData.event} | User: ${logData.userId} | Action: ${logData.type.toUpperCase()} ${logData.symbol}\n`;
                    fs.appendFile('audit.log', logLine);
                    console.log(`✅ Trace sauvegardée : Ordre #${logData.orderId}`);

                }
            } catch (error) {
                console.error("❌ Erreur de traitement du log :", error);
                // Pause de 5 secondes en cas d'erreur pour éviter de saturer le processeur
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    } catch (error) {
        console.error('❌ Impossible de démarrer le Worker:', error);
        process.exit(1);
    }
}

// Lancement du travailleur
startWorker();