/* ─────────────────────────────────────────────────────────────────────────────────────────────────────────
   restoglobal-commun.js — logique PARTAGÉE entre pointage.html (tablette) et admin.html.
   Une seule copie de chaque règle métier : jours de comptage, calendrier fournisseur, calcul de la quantité à
   commander, texte du conditionnement, message type de commande, journal des opérations.
   Aucune donnée propre à un client ici (marque blanche) : tout ce qui est paramétrable vient de la base.
   À mettre en ligne dans le MÊME dossier que pointage.html et admin.html.
   ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
(function(global){
  'use strict';
  var RG={};
  RG.VERSION='2026-09-28';

  // ── Journée « métier » ──────────────────────────────────────────────────────────────────────────────────
  // Une journée de comptage commence à 7h, pas à minuit : un comptage fait à 1h du matin après une fermeture
  // tardive appartient encore à la veille.
  RG.HEURE_DEBUT_JOURNEE=7;
  RG.JOURS_COURTS=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  RG.JOURS_LONGS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  RG.bizDateKey=function(dateLike){
    var d=dateLike?new Date(dateLike):new Date();
    d.setHours(d.getHours()-RG.HEURE_DEBUT_JOURNEE);
    return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
  };
  RG.bizGetDay=function(dateLike){
    var d=dateLike?new Date(dateLike):new Date();
    d.setHours(d.getHours()-RG.HEURE_DEBUT_JOURNEE);
    return d.getDay();
  };
  // Début et fin (exclue) de la journée métier contenant dateLike — pour filtrer un historique « du jour ».
  RG.bizJourneeBornes=function(dateLike){
    var key=RG.bizDateKey(dateLike);
    var p=key.split('-');
    var debut=new Date(parseInt(p[0],10),parseInt(p[1],10)-1,parseInt(p[2],10),RG.HEURE_DEBUT_JOURNEE,0,0,0);
    var fin=new Date(debut);fin.setDate(fin.getDate()+1);
    return {debut:debut,fin:fin,key:key};
  };

  // ── Calendrier du fournisseur ───────────────────────────────────────────────────────────────────────────
  // Un fournisseur a un calendrier quand ses jours de livraison ET son délai de commande sont renseignés.
  // (Avant, le calcul des jours de comptage se contentait des jours de livraison alors que le blocage des
  // commandes exigeait aussi le délai : deux règles différentes pour la même fiche fournisseur.)
  function delaiCommande(sup){
    return (sup&&sup.delai_commande_jours!=null&&sup.delai_commande_jours>0)?sup.delai_commande_jours:1;
  }
  RG.fournisseurACalendrier=function(sup){
    return !!(sup&&sup.delai_commande_jours!=null&&Array.isArray(sup.jours_livraison)&&sup.jours_livraison.length);
  };
  // Jours où l'on passe commande à ce fournisseur = jours de livraison moins le délai.
  RG.joursCommandeFournisseur=function(sup){
    if(!RG.fournisseurACalendrier(sup))return [];
    var n=delaiCommande(sup),set={};
    sup.jours_livraison.forEach(function(livr){set[((livr-n)%7+7)%7]=true;});
    return Object.keys(set).map(Number).sort(function(a,b){return a-b;});
  };

  // Blocage des commandes par jour (fournisseurs externes) : une règle explicite sur le produit est
  // prioritaire, sinon le calendrier du fournisseur s'applique. refDate optionnel (sinon journée métier).
  RG.reglesGateStatus=function(rules,supplier,suppliersById,refDate){
    var todayIdx=refDate?refDate.getDay():RG.bizGetDay();
    function matchesVeille(sup){
      if(!sup||!Array.isArray(sup.jours_livraison)||!sup.jours_livraison.length)return false;
      var targetIdx=((todayIdx+delaiCommande(sup))%7+7)%7;
      return sup.jours_livraison.indexOf(targetIdx)>=0;
    }
    if(rules&&rules.length){
      var matches=rules.some(function(r){
        if(r.mode==='jours_fixes')return Array.isArray(r.jours)&&r.jours.indexOf(todayIdx)>=0;
        if(r.mode==='veille_livraison')return matchesVeille(r.fournisseur_id?(suppliersById||{})[r.fournisseur_id]:supplier);
        return false;
      });
      return {gated:true,matches:matches};
    }
    if(RG.fournisseurACalendrier(supplier))return {gated:true,matches:matchesVeille(supplier)};
    return {gated:false,matches:true};
  };
  // Garde-fou : une rupture totale est toujours signalée, même hors calendrier.
  RG.isRuptureTotale=function(typeSuivi,valeur){
    if(typeSuivi==='qty'){var v=parseFloat(valeur);return !isNaN(v)&&v<=0;}
    if(typeSuivi==='rup')return valeur==='rupture';
    if(typeSuivi==='level'){var lv=parseFloat(valeur);return !isNaN(lv)&&lv<=0;}
    return true;
  };

  // ── Jours de comptage RÉELLEMENT appliqués à un produit sur un restaurant ───────────────────────────────
  // Ordre de priorité (une seule règle, utilisée partout — tablette ET admin) :
  //   1. « produit »     : jours cochés à la main sur la fiche (exception volontaire, repérable par le filtre admin)
  //   2. « regle »       : règles de commande du produit (jours fixes / veille de livraison)
  //   3. « fournisseur » : calendrier du fournisseur (jours de commande)
  //   4. « quotidien »   : rien de tout ça → tous les jours
  // seuil = ligne ingredient_seuils ; rules = règles ingredient_regles_commande de CE produit sur CE restaurant.
  RG.joursComptageEffectifs=function(seuil,rules,suppliersById){
    seuil=seuil||{};
    var sup=seuil.fournisseur_id?(suppliersById||{})[seuil.fournisseur_id]:null;
    var explicites=Array.isArray(seuil.comptage_jours)?seuil.comptage_jours:[];
    if(explicites.length)return {jours:explicites.slice().sort(function(a,b){return a-b;}),source:'produit',fournisseur:sup};
    var set={},trouve=false;
    (rules||[]).forEach(function(r){
      if(r.mode==='jours_fixes'&&Array.isArray(r.jours)){r.jours.forEach(function(d){set[d]=true;});trouve=true;}
      if(r.mode==='veille_livraison'){
        var s2=r.fournisseur_id?(suppliersById||{})[r.fournisseur_id]:sup;
        if(s2&&Array.isArray(s2.jours_livraison)&&s2.jours_livraison.length){
          var n=delaiCommande(s2);
          s2.jours_livraison.forEach(function(livr){set[((livr-n)%7+7)%7]=true;});
          trouve=true;
        }
      }
    });
    if(trouve)return {jours:Object.keys(set).map(Number).sort(function(a,b){return a-b;}),source:'regle',fournisseur:sup};
    var jf=RG.joursCommandeFournisseur(sup);
    if(jf.length)return {jours:jf,source:'fournisseur',fournisseur:sup};
    return {jours:[],source:'quotidien',fournisseur:sup};
  };
  RG.libelleJours=function(jours){
    if(!jours||!jours.length)return 'tous les jours';
    return jours.slice().sort(function(a,b){return a-b;}).map(function(d){return RG.JOURS_COURTS[d];}).join(', ');
  };

  // Un comptage reste valable jusqu'à la prochaine échéance de comptage du produit. Renvoie true s'il est
  // périmé (= le produit est « à compter »).
  RG.joursComptageExpire=function(jours,compteLe){
    var j=Array.isArray(jours)?jours:[];
    var compteKey=RG.bizDateKey(compteLe);
    if(!j.length)return compteKey!==RG.bizDateKey();
    for(var back=0;back<7;back++){
      var d=new Date();d.setDate(d.getDate()-back);
      if(j.indexOf(RG.bizGetDay(d))>=0)return compteKey<RG.bizDateKey(d);
    }
    return false;
  };

  // Une commande fournisseur ne se base QUE sur les comptages de la journée en cours (décision du 28/09/2026) :
  // un comptage d'un jour précédent, même encore « valable » pour l'écran Comptage, ne génère plus de commande.
  // Avant, un produit compté plusieurs jours plus tôt (règle propre, règles de commande) réapparaissait dans la
  // commande du jour sans avoir été recompté — avec son vieux stock (souvent 0).
  RG.estComptageDuJour=function(compteLe){
    return !!compteLe&&RG.bizDateKey(compteLe)===RG.bizDateKey();
  };

  // ── Calcul de ce qu'il faut commander ──────────────────────────────────────────────────────────────────
  RG.estSignaleNonQty=function(typeSuivi,valeur){
    if(typeSuivi==='two')return valeur==='commander';
    if(typeSuivi==='rup')return valeur==='rupture'||valeur==='faible';
    if(typeSuivi==='yn')return valeur==='non';
    if(typeSuivi==='level'){var v=parseFloat(valeur);return !isNaN(v)&&v<=25;}
    return false;
  };
  function nb(x){var v=parseFloat(x);return isNaN(v)?null:v;}
  function arrondi2(x){return Math.round(x*100)/100;}

  // Besoin BRUT (non arrondi au conditionnement) pour un comptage. Séparé de l'arrondi pour pouvoir
  // additionner plusieurs restaurants livrés ensemble avant d'arrondir UNE seule fois.
  //   s = {type_suivi, seuil_min, cible, colisage, unite_commande, unite_comptage}
  //   options.forcer = true : calcule un besoin même si le stock n'est pas sous le seuil (Labo/Cuisine,
  //   déclenchés dès la zone « Limite »).
  // Renvoie {signale, stock, stockNegatif, besoin, sansCible, qty}.
  RG.besoin=function(s,valeur,options){
    s=s||{};options=options||{};
    var type=s.type_suivi||'qty';
    if(type!=='qty'){
      var sig=RG.estSignaleNonQty(type,valeur);
      return {signale:sig,stock:null,stockNegatif:false,besoin:(sig||options.forcer)?null:0,sansCible:false,qty:false};
    }
    var v=nb(valeur),seuil=nb(s.seuil_min),cible=nb(s.cible);
    if(v===null)return {signale:false,stock:null,stockNegatif:false,besoin:0,sansCible:false,qty:true};
    var stockNegatif=v<0;
    var stock=Math.max(0,v);
    var signale=seuil!==null&&stock<seuil;
    // Sans cible : on remonte jusqu'au seuil (décision du 28/09/2026), et le produit est signalé « cible à
    // renseigner » dans l'admin. Une cible inférieure au seuil (erreur de fiche) est traitée de même.
    var sansCible=(cible===null);
    var objectif=(cible!==null&&(seuil===null||cible>=seuil))?cible:seuil;
    var besoin=(objectif!==null&&(signale||options.forcer))?Math.max(0,objectif-stock):0;
    return {signale:signale,stock:stock,stockNegatif:stockNegatif,besoin:besoin,sansCible:sansCible,qty:true};
  };

  // Arrondit un besoin brut au conditionnement et produit le texte de commande.
  //   besoin = nombre (unité de comptage), ou null pour un suivi non quantitatif (on commande 1 conditionnement).
  // Renvoie {quantite, nbColis, texte}. quantite est exprimée dans l'unité de comptage.
  RG.arrondirCommande=function(besoin,s){
    s=s||{};
    var col=nb(s.colisage);if(col!==null&&col<=0)col=null;
    var ucmd=(s.unite_commande||'').trim();
    if(besoin===null){
      if(col!==null)return {quantite:col,nbColis:1,texte:RG.texteConditionnement(1,col,ucmd,s.unite_comptage)};
      if(ucmd)return {quantite:null,nbColis:1,texte:'1 '+ucmd};
      return {quantite:null,nbColis:null,texte:'à préciser'};
    }
    if(!(besoin>0))return {quantite:0,nbColis:0,texte:''};
    if(col!==null){
      var nbColis=Math.ceil(arrondi2(besoin/col));
      return {quantite:arrondi2(nbColis*col),nbColis:nbColis,texte:RG.texteConditionnement(nbColis,col,ucmd,s.unite_comptage)};
    }
    var q=arrondi2(besoin);
    return {quantite:q,nbColis:null,texte:RG.formatNombre(q)+RG.suffixeUnite(s.unite_comptage)};
  };

  RG.formatNombre=function(x){
    if(x===null||x===undefined||isNaN(x))return '';
    return Number(x).toLocaleString('fr-FR',{maximumFractionDigits:2});
  };
  // « pièce » n'est pas affiché (« 6 » plutôt que « 6 pièce ») ; les autres unités le sont (« 5 kg »).
  RG.suffixeUnite=function(u){
    if(!u||u==='piece')return '';
    return ' '+u;
  };
  // Pluriel simple du 1er mot du conditionnement (« pack » → « packs », « carton de 12 » → « cartons de 12 »).
  RG.pluriel=function(mot,n){
    if(!mot||!(n>1))return mot||'';
    var parts=mot.split(' ');
    var w=parts[0];
    if(!/[sxz]$/i.test(w))parts[0]=w+'s';
    return parts.join(' ');
  };
  // « 2 packs de 6 », « 1 carton de 5 kg », « 3 colis de 12 » (sans conditionnement renseigné).
  RG.texteConditionnement=function(nbColis,colisage,uniteCommande,uniteComptage){
    var mot=(uniteCommande||'').trim()||'colis';
    return nbColis+' '+RG.pluriel(mot,nbColis)+' de '+RG.formatNombre(colisage)+RG.suffixeUnite(uniteComptage);
  };
  // Texte du stock compté, pour les messages et historiques.
  RG.texteStock=function(s,valeur){
    s=s||{};
    if((s.type_suivi||'qty')!=='qty'){
      var lib={commander:'à commander',ok:'OK',rupture:'rupture',faible:'faible',oui:'oui',non:'non'};
      if(s.type_suivi==='level')return valeur+'%';
      return lib[valeur]||String(valeur);
    }
    var v=nb(valeur);
    if(v===null)return String(valeur);
    return RG.formatNombre(Math.max(0,v))+RG.suffixeUnite(s.unite_comptage);
  };

  // ── Message type de commande (modifiable dans Admin > Réglages, stocké dans app_config) ────────────────
  // Variables disponibles :
  //   en-tête / pied : {fournisseur} {restaurant} {par} {date} {adresse}
  //   ligne          : {produit} {restos} {stock} {commande}
  // Une ligne dont TOUTES les variables sont vides disparaît (ex. « Adresse : {adresse} » sans adresse).
  RG.MODELE_MESSAGE_CLE='modele_message_commande';
  RG.MODELE_MESSAGE_DEFAUT={
    entete:'📦 Nouvelle commande — {fournisseur}\nRestaurant : {restaurant}\nCommandé par : {par}\nDate : {date}\nAdresse de livraison : {adresse}\n──────────────',
    ligne:'- {produit}{restos} — stock : {stock} — commande : {commande}',
    pied:'──────────────\nMerci de nous prévenir en cas de rupture de stock.'
  };
  RG.VARIABLES_MESSAGE={
    entete:['fournisseur','restaurant','par','date','adresse'],
    ligne:['produit','restos','stock','commande']
  };
  RG._modeleMessage=null;
  RG.normaliserModele=function(m){
    var d=RG.MODELE_MESSAGE_DEFAUT;
    m=m||{};
    return {
      entete:typeof m.entete==='string'?m.entete:d.entete,
      ligne:(typeof m.ligne==='string'&&m.ligne.trim())?m.ligne:d.ligne,
      pied:typeof m.pied==='string'?m.pied:d.pied
    };
  };
  RG.chargerModeleMessage=async function(db,forcer){
    if(RG._modeleMessage&&!forcer)return RG._modeleMessage;
    var m=null;
    try{
      var r=await db.from('app_config').select('value').eq('key',RG.MODELE_MESSAGE_CLE).maybeSingle();
      if(r&&r.data&&r.data.value){m=JSON.parse(r.data.value);}
    }catch(e){console.warn('RG.chargerModeleMessage : modèle par défaut utilisé',e);}
    RG._modeleMessage=RG.normaliserModele(m);
    return RG._modeleMessage;
  };
  RG.enregistrerModeleMessage=async function(db,modele){
    var m=RG.normaliserModele(modele);
    var r=await db.from('app_config').upsert({key:RG.MODELE_MESSAGE_CLE,value:JSON.stringify(m)},{onConflict:'key'});
    if(r.error)throw r.error;
    RG._modeleMessage=m;
    return m;
  };
  RG.remplir=function(texte,valeurs){
    if(!texte)return '';
    return texte.split('\n').map(function(ligne){
      var nbVars=0,nbVides=0;
      var out=ligne.replace(/\{([a-z_]+)\}/g,function(tout,nom){
        nbVars++;
        var v=valeurs&&valeurs[nom]!=null?String(valeurs[nom]):'';
        if(!v)nbVides++;
        return v;
      });
      if(nbVars>0&&nbVides===nbVars)return null;
      return out;
    }).filter(function(l){return l!==null;}).join('\n');
  };
  // ctx = {fournisseur, restaurant, par, date, adresse} ; lignes = [{produit, restos, stock, commande}]
  RG.construireMessage=function(modele,ctx,lignes){
    var m=RG.normaliserModele(modele);
    var parts=[];
    var h=RG.remplir(m.entete,ctx);if(h)parts.push(h);
    (lignes||[]).forEach(function(l){var t=RG.remplir(m.ligne,l);if(t)parts.push(t);});
    var p=RG.remplir(m.pied,ctx);if(p)parts.push(p);
    return parts.join('\n');
  };
  RG.dateCommande=function(d){
    return (d?new Date(d):new Date()).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  };

  // ── Rôles (postes) valables selon le restaurant ────────────────────────────────────────────────────────
  // roles.restaurants = liste des restaurants où le rôle s'applique ; vide ou absent = tous les restaurants.
  // Ex. un salarié « Pizzaiolo + Labo » qui se connecte au Labo ne se voit proposer que le poste Labo.
  RG.roleValablePour=function(role,restoIds){
    if(!role)return false;
    var liste=Array.isArray(role.restaurants)?role.restaurants:[];
    if(!liste.length)return true;
    var ids=Array.isArray(restoIds)?restoIds:[restoIds];
    return ids.some(function(r){return liste.indexOf(r)>=0;});
  };

  // ── Journal des opérations (jamais modifié ni effacé) ─────────────────────────────────────────────────
  // Sert de preuve : « à 17h05, 4 chèvre ont été demandés en cuisine », « fait par X à 18h10 »…
  // Ne bloque jamais l'action en cours : en cas d'échec (table absente…), renvoie false et l'écrit en console.
  //   evt = {type, restaurant_id, ingredient_code, produit_nom, quantite, detail, par_nom, ref_id}
  // Types : labo_demande, cuisine_demande, cuisine_fait, labo_envoi, fournisseur_envoi.
  RG.JOURNAL_TABLE='journal_operations';
  RG.journal=async function(db,evt){
    try{
      var row={
        type:evt.type,
        restaurant_id:evt.restaurant_id||null,
        ingredient_code:evt.ingredient_code||null,
        produit_nom:evt.produit_nom||null,
        quantite:(evt.quantite!=null&&!isNaN(evt.quantite))?evt.quantite:null,
        detail:evt.detail||null,
        par_nom:evt.par_nom||null,
        ref_id:evt.ref_id!=null?String(evt.ref_id):null
      };
      var r=await db.from(RG.JOURNAL_TABLE).insert(row);
      if(r.error){console.warn('RG.journal',r.error);return false;}
      return true;
    }catch(e){console.warn('RG.journal',e);return false;}
  };

  global.RG=RG;
})(window);
