import ExcelJS from 'exceljs';
import type { RecoletBoite } from '../types/database';

const formatDateToFrench = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    const datePart = dateString.split('T')[0];
    const [year, month, day] = datePart.split('-');

    if (!year || !month || !day) return dateString;

    return `${day}/${month}/${year}`;
};

// Fonction utilitaire pour insérer une image en gardant ses proportions sans étirement
async function insertImageProportionnelle(
    worksheet: any,
    workbook: any,
    imageUrl: string,
    startCell: string,
    maxPixelWidth: number,
    maxPixelHeight: number,
    flagOptions?: {
        showFlag?: boolean;
        flagX?: number;
        flagY?: number;
        flagSize?: number;
    }
) {
    if (!imageUrl) return;

    try {
        // 1. Chargement de l'image de fond
        const response = await fetch(imageUrl);
        if (!response.ok) return;
        const blob = await response.blob();

        // Si des options de drapeau sont fournies et activées, on fusionne via un Canvas
        let imageToProcessBlob = blob;
        if (flagOptions && flagOptions.showFlag !== false && flagOptions.flagX !== undefined && flagOptions.flagY !== undefined) {
            imageToProcessBlob = await new Promise<Blob>((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = async () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(blob);
                        return;
                    }

                    // Dessiner l'image de fond
                    ctx.drawImage(img, 0, 0);

                    // Charger et dessiner l'icône du drapeau par-dessus

                    const flagImg = new Image();
                    flagImg.crossOrigin = "anonymous";
                    flagImg.src = '/Drapeaux.png';

                    flagImg.onload = () => {
                        const baseSize = flagOptions.flagSize || 40;
                        const scaleFactor = img.width / 400;
                        const targetHeight = Math.max(24, baseSize * scaleFactor);

                        // Calcul automatique de la largeur selon le ratio réel de l'image originale
                        const imgRatio = flagImg.naturalWidth && flagImg.naturalHeight
                            ? flagImg.naturalWidth / flagImg.naturalHeight
                            : 1;

                        const finalFlagWidth = targetHeight * imgRatio;
                        const finalFlagHeight = targetHeight;

                        // Ancrage basé sur le bas/centre du drapeau
                        const xPx = (flagOptions.flagX! / 100) * img.width - finalFlagWidth / 2;
                        const yPx = (flagOptions.flagY! / 100) * img.height - finalFlagHeight;

                        // Dessin en respectant le ratio calculé
                        ctx.drawImage(flagImg, xPx, yPx, finalFlagWidth, finalFlagHeight);

                        canvas.toBlob ? canvas.toBlob((b) => resolve(b || blob), 'image/jpeg', 0.9) : resolve(blob);
                    };
                    flagImg.onerror = () => resolve(blob);
                };
                img.onerror = () => resolve(blob);
                img.src = URL.createObjectURL(blob);
            });
        }

        const arrayBuffer = await imageToProcessBlob.arrayBuffer();

        const dimensions: { width: number; height: number } = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => resolve({ width: maxPixelWidth, height: maxPixelHeight });
            img.src = URL.createObjectURL(imageToProcessBlob);
        });

        const ratio = Math.min(
            maxPixelWidth / dimensions.width,
            maxPixelHeight / dimensions.height
        );
        const finalWidth = Math.round(dimensions.width * ratio);
        const finalHeight = Math.round(dimensions.height * ratio);

        const imageId = workbook.addImage({
            buffer: arrayBuffer,
            extension: 'jpeg',
        });

        const colLetter = startCell.replace(/[0-9]/g, '');
        const rowNumber = parseInt(startCell.replace(/[^0-9]/g, ''), 10) - 1;

        let colIndex = 0;
        for (let i = 0; i < colLetter.length; i++) {
            colIndex = colIndex * 26 + (colLetter.charCodeAt(i) - 64);
        }
        colIndex -= 1;

        worksheet.addImage(imageId, {
            tl: { col: colIndex, row: rowNumber },
            ext: { width: finalWidth, height: finalHeight },
            editAs: 'oneCell',
        });
    } catch (error) {
        console.warn("Impossible d'insérer l'image proportionnelle :", error);
    }
}

/**
 * Calcule dynamiquement la cellule pour les photos multiples (Alternance colonnes A et D, descente par blocs de 20 lignes)
 */
const getCellForIndex = (index: number, baseCell: string = 'A50'): string => {
    const colPair = ['A', 'D'];
    const col = colPair[index % 2];
    const baseRow = parseInt(baseCell.replace(/[^0-9]/g, ''), 10);
    const rowOffset = Math.floor(index / 2) * 20; // Espacement vertical de 20 lignes entre chaque paire
    return `${col}${baseRow + rowOffset}`;
};

export const exportRecolementToExcel = async (record: RecoletBoite): Promise<void> => {
    try {
        const response = await fetch('/templates/Fiche_Technique_Siteur.xlsx');

        const contentType = response.headers.get('content-type');
        if (!response.ok || (contentType && contentType.includes('text/html'))) {
            throw new Error("Le modèle Fiche_Technique_Siteur.xlsx est introuvable ou renvoie une page HTML.");
        }

        const arrayBuffer = await response.arrayBuffer();

        if (arrayBuffer.byteLength < 100) {
            throw new Error("Le fichier modèle Excel semble vide ou corrompu.");
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];

        const setCell = (cellAddress: string, value: any) => {
            const cell = worksheet.getCell(cellAddress);
            cell.value = value !== null && value !== undefined ? value : '';
        };

        // =========================================================
        // MAPPING DES CELLULES 
        // =========================================================
        setCell('B5', record.id_ouvrage);
        setCell('F5', record.technicien);
        setCell('D5', formatDateToFrench(record.date_recolement));
        setCell('B17', record.non_trouvee ? 'OUI' : 'NON');

        setCell('B8', record.commune);
        setCell('D8', record.voie_numero);
        setCell('F8', record.voie_nom);

        setCell('B10', record.section_cadastrale);
        setCell('B11', record.parcelle_cadastrale);
        setCell('B13', record.domaine_assise);
        setCell('B14', record.accessibilite_site);

        if (record.reperes && Array.isArray(record.reperes)) {
            record.reperes.slice(0, 5).forEach((rep, index) => {
                const rowIndex = 19 + index;
                setCell(`A${rowIndex}`, rep.point);
                setCell(`B${rowIndex}`, rep.description);
                setCell(`C${rowIndex}`, rep.distance);
                setCell(`D${rowIndex}`, rep.observations);
            });
        }

        setCell('B26', record.forme);
        setCell('D26', record.dimensions);
        setCell('F26', record.materiau);
        setCell('B27', record.type_couvercle);
        setCell('D27', record.affleurement);
        setCell('F27', record.etat_couvercle);
        setCell('B28', record.profondeur_cm);
        setCell('D28', record.observations_physiques);

        setCell('B31', record.ecoulement);
        setCell('D31', record.depots);
        setCell('F31', record.eaux_parasites);
        setCell('B32', record.etat_parois);
        setCell('D32', record.action_preconisee);

        // =========================================================
        // GESTION DES PHOTOS
        // =========================================================
        const MAX_IMG_WIDTH = 460;
        const MAX_IMG_HEIGHT = 390;

        // Photos fixes (Situation et Couvercle)
        // Photos fixes (Situation avec son drapeau incrusté, et Couvercle)
        await insertImageProportionnelle(
            worksheet,
            workbook,
            (record as any).photo_situation_url,
            'A36',
            MAX_IMG_WIDTH,
            MAX_IMG_HEIGHT,
            {
                showFlag: (record as any).show_situation_flag,
                flagX: (record as any).flag_x,
                flagY: (record as any).flag_y,
                flagSize: (record as any).flag_flag_size ?? (record as any).flag_size
            }
        );
        await insertImageProportionnelle(worksheet, workbook, (record as any).photo_couvercle_url, 'D36', MAX_IMG_WIDTH, MAX_IMG_HEIGHT);

        // Photos intérieures (Supporte le tableau multiple `photos_interieur_urls` avec repli rétro-compatible sur `photo_interieur_url`)
        const photosInterieur: string[] =
            Array.isArray((record as any).photos_interieur_urls) && (record as any).photos_interieur_urls.length > 0
                ? (record as any).photos_interieur_urls
                : ((record as any).photo_interieur_url ? [(record as any).photo_interieur_url] : []);

        for (let i = 0; i < photosInterieur.length; i++) {
            const url = photosInterieur[i];
            const cellAddress = getCellForIndex(i, 'A50');
            await insertImageProportionnelle(worksheet, workbook, url, cellAddress, MAX_IMG_WIDTH, MAX_IMG_HEIGHT);
        }

        // =========================================================
        // GÉNÉRATION ET TÉLÉCHARGEMENT
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