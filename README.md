# Simulateur ETF PEA

En ligne : https://ironmaaax.github.io/SimulateurPEA/

Application web autonome : un seul fichier HTML, sans dépendance à l’exécution (hors police Google Fonts, avec repli système).

## Utiliser
Ouvrir `dist/simulateur-etf-pea.html` dans un navigateur (Chrome, Firefox, Safari, Edge).
Réglages et données modifiées sont enregistrés dans le `localStorage` du navigateur.

## Structure
| Fichier | Rôle |
|---|---|
| `src/core.js` | Moteur sans DOM : données d’origine (`DEFAULT_DATA`), statistiques, modèle (`buildModel`), Monte Carlo (`simulateAll`), rejeu (`backtestAll`), solveur d’objectif (`solveMonthly`), optimiseur (`optimize`), validation. Utilisable sous Node : `require("./src/core.js")`. |
| `src/ui.js` | Interface : état et persistance, onglets, liaisons `data-bind`, graphiques SVG, éditeur de données, réglages, exports. |
| `src/style.css` | Thèmes clair et sombre, mise en page téléphone (une colonne) et ordinateur (deux colonnes dès 1024 px). |
| `src/body.html` | Structure HTML des cinq onglets. |
| `build.py` | Assemble `src/` en `dist/simulateur-etf-pea.html`. |
| `test/ui.test.js` | Tests de bout en bout dans un navigateur simulé (jsdom). |
| `scripts/maj_cours.py` | Récupère les derniers cours des ETF sur Yahoo Finance et écrit `data/cours.json`. |
| `.github/workflows/cours.yml` | Sur GitHub : met les cours à jour en semaine (toutes les 2 heures pendant la séance, puis après la clôture) et publie le simulateur sur GitHub Pages. |

## Modifier puis reconstruire
    python3 build.py

## Tester
    npm install
    npm test

## Hors claude.ai
L’export de fichiers (CSV, configuration) passe par la capacité `downloads` de claude.ai quand elle existe ;
ailleurs, une fenêtre affiche le contenu à copier.

## Cours en ligne
Chaque ligne du capital accepte un **nombre de parts** : la ligne est alors valorisée au dernier cours.
La performance de l’année en cours des fiches vient aussi des cours.

- **Version publiée sur GitHub Pages** : lit `cours.json` publié à côté d’elle, rien à régler.
- **Fichier ouvert depuis l’ordinateur** : lit par défaut `https://raw.githubusercontent.com/Ironmaaax/SimulateurPEA/main/data/cours.json`
  (modifiable dans Réglages, « Adresse des cours en ligne »).
- Sans connexion, le simulateur reprend les derniers cours enregistrés dans le navigateur.

Mise à jour à la main :

    pip install yfinance
    python scripts/maj_cours.py
    python build.py

### Mise en place sur GitHub (une fois)
1. Créer un dépôt **public** (GitHub Pages et l’adresse `raw.githubusercontent.com` sont gratuits pour un dépôt public) et y pousser ce dossier sur la branche `main`.
2. Settings → Pages → Source : **GitHub Actions**.
3. Actions → « Cours et publication » → **Run workflow** pour un premier lancement.

Le simulateur est ensuite en ligne à https://ironmaaax.github.io/SimulateurPEA/.
