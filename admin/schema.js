/* ============================================================================
 * Schéma de contenu du site Laëti'Bienfaits.
 * Chaque entrée = un onglet de la console. Les "fields" décrivent les champs
 * éditables ; les "key" correspondent au modèle de contenu (content.default.json
 * et aux marqueurs data-k/data-ki du site).
 * Types : text · textarea · image · list (item = sous-champs OU 'text'/'textarea'/'image') · group
 * ========================================================================== */
const I = {
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  quote:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h4v6a4 4 0 0 1-4 4M14 7h4v6a4 4 0 0 1-4 4"/></svg>',
  grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
  heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 22l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  leaf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 16-9 17z"/><path d="M4 21c2-4 5-7 9-8"/></svg>',
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  tag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  img:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.8l6.5-.9z"/></svg>',
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
  foot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z" opacity=".3"/><path d="M4 16h16M4 20h10"/></svg>',
  cog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L16.5 3h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2.4h4l.3-2.4a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z"/></svg>',
};

window.LB_SCHEMA = [
  {
    id:'general', label:'Réglages généraux', icon:I.cog,
    intro:"Le logo, le nom et le bouton qui apparaissent en haut du site (et dans le bas de page).",
    fields:[
      { type:'image', key:'general.logo', label:'Logo', hint:'Affiché dans le bandeau et le pied de page.' },
      { type:'text', key:'general.brand', label:'Nom de la marque', hint:'Ex. Laëti’Bienfaits' },
      { type:'text', key:'general.tagline', label:'Sous-titre du logo', hint:'Ex. Naturopathie · Kinésiologie' },
      { type:'text', key:'general.cta', label:'Texte du bouton rendez-vous' },
    ],
  },
  {
    id:'hero', label:'Accueil (diaporama)', icon:I.home,
    intro:"Le grand diaporama tout en haut du site. Chaque diapositive a une image de fond et un message.",
    fields:[
      { type:'list', key:'hero.slides', label:'Diapositives', itemLabel:'Diapositive', item:[
        { type:'image', key:'image', label:'Image de fond' },
        { type:'text', key:'eyebrow', label:'Petit texte (pastille)' },
        { type:'textarea', key:'title', label:'Titre principal', rows:2 },
        { type:'textarea', key:'subtitle', label:'Sous-titre', rows:2 },
      ]},
    ],
  },
  {
    id:'citation', label:'Citation', icon:I.quote,
    intro:"La phrase mise en avant entre l'accueil et la suite.",
    fields:[ { type:'textarea', key:'citation.quote', label:'Citation', rows:3 } ],
  },
  {
    id:'pillars', label:'Les 3 piliers', icon:I.grid,
    intro:"Les trois cercles verts avec un pictogramme et un titre.",
    fields:[
      { type:'list', key:'pillars.items', label:'Piliers', itemLabel:'Pilier', item:[
        { type:'image', key:'image', label:'Pictogramme' },
        { type:'text', key:'title', label:'Titre' },
      ]},
    ],
  },
  {
    id:'about', label:'Qui suis-je', icon:I.user,
    intro:"Votre portrait, votre présentation et vos paragraphes de bio.",
    fields:[
      { type:'image', key:'about.portrait', label:'Portrait' },
      { type:'text', key:'about.eyebrow', label:'Petit titre', hint:'Ex. Qui suis-je ?' },
      { type:'text', key:'about.name', label:'Votre nom (en évidence)' },
      { type:'textarea', key:'about.lead', label:'Phrase d’accroche (en gras)', rows:2 },
      { type:'list', key:'about.bio', label:'Paragraphes de présentation', itemLabel:'Paragraphe', item:'textarea' },
      { type:'list', key:'about.badges', label:'Étiquettes (sous la bio)', itemLabel:'Étiquette', item:'text' },
    ],
  },
  {
    id:'pourquoi', label:'Pourquoi consulter', icon:I.list,
    intro:"La liste « Vous ressentez peut-être… ».",
    fields:[
      { type:'text', key:'pourquoi.eyebrow', label:'Petit titre' },
      { type:'text', key:'pourquoi.title', label:'Titre (début)' },
      { type:'text', key:'pourquoi.titleAccent', label:'Titre (partie en vert italique)' },
      { type:'list', key:'pourquoi.reasons', label:'Raisons / ressentis', itemLabel:'Ligne', item:'text' },
      { type:'textarea', key:'pourquoi.closing', label:'Phrase de fin', rows:2 },
    ],
  },
  {
    id:'approche', label:'Mon approche', icon:I.leaf,
    intro:"La section « Une vision globale de votre bien-être ».",
    fields:[
      { type:'text', key:'approche.eyebrow', label:'Petit titre' },
      { type:'text', key:'approche.title', label:'Titre (début)' },
      { type:'text', key:'approche.titleAccent', label:'Titre (partie en vert italique)' },
      { type:'textarea', key:'approche.intro', label:'Phrase d’introduction', rows:2 },
      { type:'list', key:'approche.dimensions', label:'Les 3 dimensions', itemLabel:'Dimension', item:[
        { type:'image', key:'image', label:'Pictogramme' },
        { type:'text', key:'label', label:'Nom' },
      ]},
      { type:'textarea', key:'approche.text1', label:'Paragraphe', rows:2 },
      { type:'text', key:'approche.text2', label:'Phrase « Mon objectif… »' },
      { type:'list', key:'approche.chips', label:'Bénéfices (pastilles)', itemLabel:'Bénéfice', item:'text' },
    ],
  },
  {
    id:'pratiques', label:'Mes pratiques', icon:I.heart,
    intro:"Les 4 vignettes de pratiques. Le « contenu détaillé » s’affiche dans la fenêtre qui s’ouvre au clic. Le contenu détaillé peut contenir de la mise en forme (titres, listes) — modifiez surtout le texte.",
    fields:[
      { type:'text', key:'pratiques.eyebrow', label:'Petit titre' },
      { type:'text', key:'pratiques.title', label:'Titre de la section' },
      { type:'list', key:'pratiques.items', label:'Pratiques', itemLabel:'Pratique', item:[
        { type:'text', key:'eyebrow', label:'Numéro / surtitre', hint:'Ex. Pratique 01' },
        { type:'text', key:'title', label:'Nom de la pratique' },
        { type:'textarea', key:'body', label:'Contenu détaillé (fenêtre)', rows:12, hint:'Texte de la fenêtre qui s’ouvre. Conservez les balises <h4>…</h4> et <p>…</p> telles quelles, modifiez le texte entre.' },
      ]},
    ],
  },
  {
    id:'tarifs', label:'Tarifs', icon:I.tag,
    intro:"Les 3 cartes de tarifs et leurs prestations.",
    fields:[
      { type:'text', key:'tarifs.eyebrow', label:'Petit titre' },
      { type:'text', key:'tarifs.title', label:'Titre de la section' },
      { type:'list', key:'tarifs.cards', label:'Cartes de tarifs', itemLabel:'Carte', item:[
        { type:'text', key:'title', label:'Titre de la carte' },
        { type:'list', key:'items', label:'Prestations', itemLabel:'Prestation', item:[
          { type:'text', key:'name', label:'Nom' },
          { type:'text', key:'duration', label:'Durée', hint:'Ex. 45 min · 1h' },
          { type:'text', key:'price', label:'Prix', hint:'Ex. 60 €' },
        ]},
      ]},
    ],
  },
  {
    id:'evenements', label:'Événements / cueillette', icon:I.cal,
    intro:"La carte « Balade cueillette » et son diaporama de photos.",
    fields:[
      { type:'text', key:'evenements.eyebrow', label:'Petit titre' },
      { type:'text', key:'evenements.meta', label:'Date / lieu (ligne verte italique)' },
      { type:'text', key:'evenements.title', label:'Titre' },
      { type:'textarea', key:'evenements.description', label:'Description', rows:5 },
      { type:'list', key:'evenements.photos', label:'Photos du diaporama', itemLabel:'Photo', item:'image' },
    ],
  },
  {
    id:'galerie', label:'Galerie', icon:I.img,
    intro:"Les photos « Au cabinet » et la vidéo. Cliquez sur Changer pour remplacer une image.",
    fields:[
      { type:'text', key:'galerie.eyebrow', label:'Petit titre' },
      { type:'text', key:'galerie.title', label:'Titre de la section' },
      { type:'list', key:'galerie.images', label:'Photos', itemLabel:'Photo', item:'image' },
      { type:'group', label:'Vidéo', fields:[
        { type:'image', key:'galerie.video', label:'Fichier vidéo (MP4)', accept:'video/mp4' },
        { type:'image', key:'galerie.videoPoster', label:'Image d’aperçu de la vidéo' },
      ]},
    ],
  },
  {
    id:'temoignages', label:'Témoignages', icon:I.star,
    intro:"Les avis affichés dans le carrousel + le lien vers votre fiche Google.",
    fields:[
      { type:'text', key:'temoignages.eyebrow', label:'Petit titre' },
      { type:'text', key:'temoignages.title', label:'Titre de la section' },
      { type:'text', key:'temoignages.googleLabel', label:'Texte de la pastille Google', hint:'Ex. 5,0 · 32 avis Google' },
      { type:'text', key:'temoignages.googleUrl', label:'Lien vers vos avis Google' },
      { type:'list', key:'temoignages.items', label:'Avis', itemLabel:'Avis', item:[
        { type:'text', key:'name', label:'Prénom / nom affiché' },
        { type:'textarea', key:'text', label:'Texte de l’avis', rows:4 },
      ]},
    ],
  },
  {
    id:'contact', label:'Contact', icon:I.mail,
    intro:"Vos coordonnées affichées dans la section Contact et le pied de page.",
    fields:[
      { type:'text', key:'contact.eyebrow', label:'Petit titre' },
      { type:'text', key:'contact.title', label:'Titre (début)' },
      { type:'text', key:'contact.titleAccent', label:'Titre (partie en vert italique)' },
      { type:'textarea', key:'contact.subtitle', label:'Phrase d’introduction', rows:2 },
      { type:'textarea', key:'contact.address', label:'Adresse', rows:2, hint:'Vous pouvez aller à la ligne.' },
      { type:'text', key:'contact.phone', label:'Téléphone (affiché)' },
      { type:'text', key:'contact.email', label:'Email' },
      { type:'text', key:'contact.hours', label:'Horaires' },
      { type:'textarea', key:'contact.hoursNote', label:'Précision horaires', rows:2 },
      { type:'text', key:'contact.mapUrl', label:'Lien Google Maps (carte)', hint:'Adresse de la carte intégrée.' },
    ],
  },
  {
    id:'footer', label:'Pied de page', icon:I.foot,
    intro:"Le texte et les réseaux sociaux tout en bas du site.",
    fields:[
      { type:'textarea', key:'footer.description', label:'Texte de présentation', rows:3 },
      { type:'text', key:'footer.instagram', label:'Lien Instagram' },
      { type:'text', key:'footer.facebook', label:'Lien Facebook' },
      { type:'text', key:'footer.copyright', label:'Mention en bas (copyright)' },
    ],
  },
];
