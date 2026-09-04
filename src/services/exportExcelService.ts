import ExcelJS from 'exceljs';
import type { RecoletBoite } from '../types/database';

/**
 * Télécharge une image depuis une URL (Cloudinary) et la convertit en ArrayBuffer.
 */
/*const fetchImageAsBuffer = async (url: string): Promise<ArrayBuffer | null> => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Erreur réseau lors du téléchargement de l'image");
        return await response.arrayBuffer();
    } catch (error) {
        console.error("Erreur fetch image:", error);
        return null;
    }
};
*/

const formatDateToFrench = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    // On extrait juste la partie "AAAA-MM-JJ" du début de la chaîne
    const datePart = dateString.split('T')[0];
    const [year, month, day] = datePart.split('-');

    if (!year || !month || !day) return dateString; // Sécurité si le format est inattendu

    return `${day}/${month}/${year}`;
};


// Fonction utilitaire pour insérer une image en gardant ses proportions sans étirement
async function insertImageProportionnelle(
    worksheet: any,
    workbook: any,
    imageUrl: string,
    startCell: string, // Ex: 'B38'
    maxPixelWidth: number,
    maxPixelHeight: number
) {
    if (!imageUrl) return;

    try {
        // 1. Télécharger l'image sous forme de blob/arrayBuffer
        const response = await fetch(imageUrl);
        if (!response.ok) return;
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        // 2. Charger l'image dans un objet Image natif pour lire ses dimensions réelles
        const dimensions: { width: number; height: number } = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => resolve({ width: maxPixelWidth, height: maxPixelHeight }); // Valeur de repli en cas d'erreur
            img.src = URL.createObjectURL(blob);
        });

        // 3. Calculer le ratio pour conserver les proportions d'origine
        const ratio = Math.min(
            maxPixelWidth / dimensions.width,
            maxPixelHeight / dimensions.height
        );
        const finalWidth = Math.round(dimensions.width * ratio);
        const finalHeight = Math.round(dimensions.height * ratio);

        // 4. Déterminer l'extension (par défaut 'jpeg' ou 'png')
        const extension = imageUrl.toLowerCase().includes('.png') ? 'png' : 'jpeg';

        // 5. Ajouter l'image au classeur ExcelJS
        const imageId = workbook.addImage({
            buffer: arrayBuffer,
            extension: extension,
        });

        // 6. Convertir la référence de cellule (ex: 'B38') en coordonnées numériques (col, row) pour ExcelJS
        // Note: ExcelJS utilise généralement un index commençant à 0 pour les colonnes et les lignes
        const colLetter = startCell.replace(/[0-9]/g, '');
        const rowNumber = parseInt(startCell.replace(/[^0-9]/g, ''), 10) - 1;

        // Conversion simple de la lettre de colonne en index (A=0, B=1, etc.)
        let colIndex = 0;
        for (let i = 0; i < colLetter.length; i++) {
            colIndex = colIndex * 26 + (colLetter.charCodeAt(i) - 64);
        }
        colIndex -= 1;

        // 7. Insérer l'image avec sa position de départ et ses dimensions fixes proportionnelles
        worksheet.addImage(imageId, {
            tl: { col: colIndex, row: rowNumber },
            ext: { width: finalWidth, height: finalHeight },
            editAs: 'oneCell',
        });
    } catch (error) {
        console.warn("Impossible d'insérer l'image proportionnelle :", error);
    }
}

export const exportRecolementToExcel = async (record: RecoletBoite): Promise<void> => {
    try {
        // 1. Récupération du modèle vierge depuis le dossier public (avec le nom exact de ton fichier)
        const response = await fetch('/templates/Fiche_Technique_Siteur.xlsx');

        // Vérification de la réponse HTTP et du type de contenu (pour intercepter les redirections HTML/404)
        const contentType = response.headers.get('content-type');
        if (!response.ok || (contentType && contentType.includes('text/html'))) {
            throw new Error("Le modèle Fiche_Technique_Siteur.xlsx est introuvable ou renvoie une page HTML. Vérifiez qu'il est bien placé dans /public/templates/Fiche_Technique_Siteur.xlsx.");
        }

        const arrayBuffer = await response.arrayBuffer();

        // Petite sécurité supplémentaire pour vérifier la taille du fichier
        if (arrayBuffer.byteLength < 100) {
            throw new Error("Le fichier modèle Excel semble vide ou corrompu.");
        }

        // 2. Initialisation d'ExcelJS avec le fichier modèle
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0]; // On cible le premier onglet

        // Helper pour écrire une valeur sans risque
        const setCell = (cellAddress: string, value: any) => {
            const cell = worksheet.getCell(cellAddress);
            cell.value = value !== null && value !== undefined ? value : '';
        };

        // =========================================================
        // 3. MAPPING DES CELLULES 
        // =========================================================

        // Informations Générales
        setCell('B5', record.id_ouvrage);
        setCell('F5', record.technicien);
        setCell('D5', formatDateToFrench(record.date_recolement));
        setCell('B17', record.non_trouvee ? 'OUI' : 'NON');

        // Localisation & Cadastre
        setCell('B8', record.commune);
        setCell('D8', record.voie_numero);
        setCell('F8', record.voie_nom);

        setCell('B10', record.section_cadastrale);
        setCell('B11', record.parcelle_cadastrale);
        setCell('B13', record.domaine_assise);
        setCell('B14', record.accessibilite_site);

        //setCell('C14', record.latitude);
        //setCell('E14', record.longitude);

        // Tableau des repères (5 lignes maximum de la ligne 19 à 23)
        if (record.reperes && Array.isArray(record.reperes)) {
            record.reperes.slice(0, 5).forEach((rep, index) => {
                const rowIndex = 19 + index;
                setCell(`A${rowIndex}`, rep.point);
                setCell(`B${rowIndex}`, rep.description);
                setCell(`C${rowIndex}`, rep.distance);
                setCell(`D${rowIndex}`, rep.observations);
            });
        }

        // Caractéristiques physiques
        setCell('B26', record.forme);
        setCell('D26', record.dimensions);
        setCell('F26', record.materiau);
        setCell('B27', record.type_couvercle);
        setCell('D27', record.affleurement);
        setCell('F27', record.etat_couvercle);
        setCell('B28', record.profondeur_cm);
        setCell('D28', record.observations_physiques);

        // Écoulement & Diagnostic
        setCell('B31', record.ecoulement);
        setCell('D31', record.depots);
        setCell('F31', record.eaux_parasites);
        setCell('B32', record.etat_parois);
        setCell('D32', record.action_preconisee);


        // =========================================================
        // 4. GESTION DES PHOTOS
        // =========================================================
        /*
        const insertImage = async (url: string | null | undefined, range: string) => {
            if (!url) return;
            const imgBuffer = await fetchImageAsBuffer(url);
            if (imgBuffer) {
                const imageId = workbook.addImage({
                    buffer: imgBuffer,
                    extension: 'jpeg',
                });
                worksheet.addImage(imageId, range);
            }
        };
        */

        // Estimation de la taille max en pixels de ta zone (ex: ~250px de large sur ~180px de haut)
        const MAX_IMG_WIDTH = 460;
        const MAX_IMG_HEIGHT = 390;

        // Remplacement propre sans casser l'existant :
        await insertImageProportionnelle(worksheet, workbook, (record as any).photo_situation_url, 'A36', MAX_IMG_WIDTH, MAX_IMG_HEIGHT);
        await insertImageProportionnelle(worksheet, workbook, (record as any).photo_couvercle_url, 'D36', MAX_IMG_WIDTH, MAX_IMG_HEIGHT);
        await insertImageProportionnelle(worksheet, workbook, (record as any).photo_interieur_url, 'A50', MAX_IMG_WIDTH, MAX_IMG_HEIGHT);

        // =========================================================
        // 5. GÉNÉRATION ET TÉLÉCHARGEMENT
        // =========================================================
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `Fiche_Recolement_${record.id_ouvrage || 'Sans_ID'}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Erreur détaillée lors de l'export Excel :", error);
        throw error;
    }
};