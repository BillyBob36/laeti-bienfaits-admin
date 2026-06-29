/* ============================================================================
 * Schéma de contenu éditable — version SIMPLIFIÉE (6 onglets).
 * Seul ce que la cliente met réellement à jour est exposé ; le reste du site
 * (logo, accueil, textes éditoriaux, pied de page…) est figé et géré par nous.
 * Types : text · textarea · image · toggle · list · group
 * ========================================================================== */
const I = {
  tag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  leaf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 16-9 17z"/><path d="M4 21c2-4 5-7 9-8"/></svg>',
  img:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 14-7v16L3 13z"/><path d="M3 11v3a2 2 0 0 0 2 2h1"/><path d="M9 14v4a2 2 0 0 0 4 0"/></svg>',
  rdv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M12.5 13.5v2.5l1.8 1"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
};

window.LB_SCHEMA = [
  {
    id:'rdv', label:'Rendez-vous', icon:I.rdv, custom:'rdv',
    intro:"Réglez vos disponibilités, créez un RDV vous-même, et traitez les demandes reçues (accepter / refuser).",
    fields:[],
  },
  {
    id:'patients', label:'Patients', icon:I.users, custom:'patients',
    intro:"Votre annuaire de patients. Ajoutez/modifiez une fiche, importez ou exportez en CSV. Les patients sont aussi créés automatiquement quand vous prenez un rendez-vous.",
    fields:[],
  },
  {
    id:'tarifs', label:'Prestations & tarifs', icon:I.tag,
    intro:"Vos prestations et leurs prix, regroupées par catégorie. Ajoutez (＋), réordonnez (↑↓) ou supprimez (🗑) une prestation quand votre offre évolue.",
    fields:[
      { type:'list', key:'tarifs.cards', label:'Catégories de prestations', itemLabel:'Catégorie', item:[
        { type:'text', key:'title', label:'Titre de la catégorie' },
        { type:'list', key:'items', label:'Prestations', itemLabel:'Prestation', item:[
          { type:'text', key:'name', label:'Nom de la prestation' },
          { type:'text', key:'duration', label:'Durée', hint:'Ex. 45 min · 1h (laissez vide si non précisé)' },
          { type:'text', key:'price', label:'Prix', hint:'Ex. 60 €' },
        ]},
      ]},
    ],
  },
  {
    id:'evenements', label:'Événements & ateliers', icon:I.cal,
    intro:"Vos événements : balade/marche cueillette, salons, ateliers… Ajoutez-en autant que nécessaire avec leurs photos.",
    fields:[
      { type:'list', key:'evenements.events', label:'Événements', itemLabel:'Événement', item:[
        { type:'text', key:'title', label:'Titre' },
        { type:'text', key:'when', label:'Date / fréquence', hint:'Ex. Chaque année au 1ᵉʳ mai · Samedi 12 octobre' },
        { type:'text', key:'where', label:'Lieu' },
        { type:'textarea', key:'description', label:'Description', rows:5 },
        { type:'gallery', key:'photos', label:'Photos', accept:'image/*' },
      ]},
    ],
  },
  {
    id:'formations', label:'Formations & qualifications', icon:I.leaf,
    intro:"La liste de vos formations, certifications et qualifications, affichée sur votre page « Qui suis-je ».",
    fields:[
      { type:'list', key:'formations.items', label:'Formations / qualifications', itemLabel:'Ligne', item:'text' },
    ],
  },
  {
    id:'galerie', label:'Galerie photos', icon:I.img,
    intro:"Les photos « Au cabinet ». Survolez une photo pour la supprimer (✕) ou la déplacer (‹ ›). Cliquez sur « Ajouter une photo » en bas pour en ajouter — vous pouvez en sélectionner plusieurs d'un coup.",
    fields:[
      { type:'gallery', key:'galerie.images', label:'Photos', accept:'image/*' },
      { type:'group', label:'Vidéo (optionnelle)', fields:[
        { type:'image', key:'galerie.video', label:'Fichier vidéo (MP4)', accept:'video/mp4' },
        { type:'image', key:'galerie.videoPoster', label:'Image d’aperçu de la vidéo' },
      ]},
    ],
  },
  {
    id:'contact', label:'Coordonnées & horaires', icon:I.mail,
    intro:"Vos coordonnées, affichées dans la section Contact et le pied de page du site.",
    fields:[
      { type:'textarea', key:'contact.address', label:'Adresse', rows:2, hint:'Vous pouvez aller à la ligne.' },
      { type:'text', key:'contact.phone', label:'Téléphone' },
      { type:'text', key:'contact.email', label:'Email' },
      { type:'text', key:'contact.hours', label:'Horaires', hint:'Ex. Consultations sur rendez-vous du mardi au samedi' },
      { type:'textarea', key:'contact.hoursNote', label:'Précision (sous les horaires)', rows:2 },
      { type:'text', key:'contact.mapUrl', label:'Lien de la carte (Google Maps)', hint:'À changer seulement en cas de déménagement.' },
    ],
  },
  {
    id:'annonce', label:'Bandeau d’annonce', icon:I.bell,
    intro:"Un message temporaire affiché en haut du site (congés, prochaine balade, nouvelle prestation…). Activez-le quand vous en avez besoin, désactivez-le ensuite.",
    fields:[
      { type:'toggle', key:'annonce.enabled', label:'Afficher le bandeau sur le site' },
      { type:'textarea', key:'annonce.text', label:'Message à afficher', rows:2, hint:'Ex. « Cabinet fermé du 1ᵉʳ au 15 août — reprise le 16. »' },
    ],
  },
  {
    id:'sms', label:'Messages SMS', icon:I.chat, custom:'sms',
    intro:"Personnalisez les SMS automatiques envoyés à vos clients. Variables disponibles : {prenom}, {date}, {heure}, {motif} (remplacées automatiquement).",
    fields:[],
  },
];
