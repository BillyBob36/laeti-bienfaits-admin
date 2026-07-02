/* ============================================================================
 * Schéma de contenu éditable — version SIMPLIFIÉE (6 onglets).
 * Seul ce que la cliente met réellement à jour est exposé ; le reste du site
 * (logo, accueil, textes éditoriaux, pied de page…) est figé et géré par nous.
 * Types : text · textarea · image · toggle · list · group
 * ========================================================================== */
/* Pictogrammes : icônes Lucide (lucide.dev, licence ISC — libres de droits), monochromes. */
const I = {
  rdv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4.5"/><path d="M16 2v4M8 2v4M3 10h7"/><circle cx="17.5" cy="17.5" r="4.5"/><path d="M17.5 16v1.6l1.1 1"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  tag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>',
  cap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>',
  img:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  mega:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 9h10"/><path d="M7 13h6"/></svg>',
  help:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
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
    id:'formations', label:'Formations & qualifications', icon:I.cap,
    intro:"La liste de vos formations, certifications et qualifications, affichée sur votre page « Qui suis-je ».",
    fields:[
      { type:'list', key:'formations.items', label:'Formations / qualifications', itemLabel:'Ligne', item:'text' },
    ],
  },
  {
    id:'faq', label:'FAQ', icon:I.help,
    intro:"Les questions/réponses affichées dans la section FAQ de votre site. Ajoutez (＋), réordonnez (↑↓) ou supprimez (🗑) une question. Répondez de façon factuelle et rassurante.",
    fields:[
      { type:'list', key:'faq.items', label:'Questions / réponses', itemLabel:'Question', item:[
        { type:'text', key:'q', label:'Question' },
        { type:'textarea', key:'a', label:'Réponse', rows:4 },
      ]},
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
    id:'annonce', label:'Bandeau d’annonce', icon:I.mega,
    intro:"Un message temporaire affiché en haut du site (congés, prochaine balade, nouvelle prestation…). Activez-le quand vous en avez besoin, désactivez-le ensuite.",
    fields:[
      { type:'toggle', key:'annonce.enabled', label:'Afficher le bandeau sur le site' },
      { type:'textarea', key:'annonce.text', label:'Message à afficher', rows:2, hint:'Ex. « Cabinet fermé du 1ᵉʳ au 15 août — reprise le 16. »' },
      { type:'toggle', key:'annonce.scroll', label:'Faire défiler le texte (de droite à gauche)' },
    ],
  },
  {
    id:'sms', label:'Messages SMS', icon:I.chat, custom:'sms',
    intro:"Personnalisez les SMS automatiques envoyés à vos clients. Variables disponibles : {prenom}, {date}, {heure}, {motif} (remplacées automatiquement).",
    fields:[],
  },
];
