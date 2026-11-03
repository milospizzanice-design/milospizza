/* ─────────────────────────────────────────────────────────────────────────────────────────────────────────
   restoglobal-langues.js — LANGUES et TRADUCTIONS de la carte en ligne (index.html, emporter.html).
   Une seule copie des règles, chargée par les deux cartes. Créé le 02/11/2026.

   Principe (pour que des traductions fausses ou manquantes ne puissent plus revenir) :
   • Le français est la langue source. Chaque traduction garde l'EMPREINTE du texte français dont elle vient
     (objet.tradEmp["champ.langue"]). Si le français change, la traduction est considérée périmée : la carte
     affiche alors le français (jamais une traduction qui ne correspond plus), et l'éditeur la refait.
   • La liste des langues est UNE liste (RGL.LANGUES), complétée par design.json → « langues ». Ajouter une
     langue = une ligne : tous les textes de la carte ET de l'interface sont alors traduits dans cette langue.
   • Les traductions sont faites par le Worker Cloudflare « restoglobal-traduction » (IA + lexique cuisine),
     appelé par l'éditeur après chaque enregistrement et avant chaque publication.
   Marque blanche : aucune donnée propre à un restaurant ici.
   ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
(function(global){
  'use strict';
  var RGL={VERSION:'2026-11-02a',SOURCE:'fr'};

  // ── Langues ─────────────────────────────────────────────────────────────────────────────────────────
  RGL.LANGUES_BASE=[
    {code:'fr',nom:'Français',court:'FR',drapeau:'🇫🇷'},
    {code:'en',nom:'English',court:'EN',drapeau:'🇬🇧'},
    {code:'it',nom:'Italiano',court:'IT',drapeau:'🇮🇹'},
    {code:'de',nom:'Deutsch',court:'DE',drapeau:'🇩🇪'},
    {code:'es',nom:'Español',court:'ES',drapeau:'🇪🇸'},
    {code:'zh',nom:'中文',court:'中文',drapeau:'🇨🇳'},
    {code:'ru',nom:'Русский',court:'РУС',drapeau:'🇷🇺'}
  ];
  RGL.LANGUES=RGL.LANGUES_BASE.slice();
  // design.json → langues : [{code, nom, court, drapeau, masquee}] ajoutées ou modifiées par le restaurant.
  RGL.configurerLangues=function(liste){
    var out=RGL.LANGUES_BASE.map(function(l){return Object.assign({},l);});
    (Array.isArray(liste)?liste:[]).forEach(function(l){
      if(!l||!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(l.code||''))return;
      var ex=out.filter(function(x){return x.code===l.code;})[0];
      if(ex)Object.assign(ex,l);else out.push({code:l.code,nom:l.nom||l.code,court:l.court||l.code.toUpperCase(),drapeau:l.drapeau||'🌐',masquee:!!l.masquee});
    });
    RGL.LANGUES=out;
    return out;
  };
  RGL.visibles=function(){return RGL.LANGUES.filter(function(l){return !l.masquee;});};
  RGL.cibles=function(){return RGL.LANGUES.filter(function(l){return l.code!==RGL.SOURCE&&!l.masquee;}).map(function(l){return l.code;});};
  RGL.langue=function(code){return RGL.LANGUES.filter(function(l){return l.code===code;})[0]||null;};

  // ── Empreinte d'un texte (FNV-1a 32 bits sur l'UTF-8 du texte nettoyé) ─────────────────────────────────
  function utf8(s){
    if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(s);
    var b=unescape(encodeURIComponent(s)),out=new Uint8Array(b.length);for(var i=0;i<b.length;i++)out[i]=b.charCodeAt(i);return out;
  }
  RGL.normaliser=function(t){return String(t==null?'':t).replace(/\s+/g,' ').trim();};
  RGL.empreinte=function(t){
    var o=utf8(RGL.normaliser(t)),h=0x811c9dc5;
    for(var i=0;i<o.length;i++){h^=o[i];h=Math.imul(h,0x01000193)>>>0;}
    return ('0000000'+h.toString(16)).slice(-8);
  };

  // ── Lecture / écriture d'un champ traduisible ───────────────────────────────────────────────────────
  // Un champ est soit un texte (français), soit un objet {fr, en, …}. Pour un texte, les traductions sont rangées
  // dans objet.trad[champ][langue]. Dans les deux cas, l'empreinte est dans objet.tradEmp["champ.langue"].
  RGL.fr=function(o,f){
    if(!o)return '';
    var v=o[f];
    if(v&&typeof v==='object')return v.fr||'';
    return v==null?'':String(v);
  };
  function brut(o,f,l){
    var v=o[f];
    if(v&&typeof v==='object')return v[l]||'';
    return (o.trad&&o.trad[f]&&o.trad[f][l])||'';
  }
  // Texte à afficher : la traduction si elle existe ET correspond au français actuel, sinon le français.
  RGL.lire=function(o,f,l){
    var fr=RGL.fr(o,f);
    if(!l||l===RGL.SOURCE||!fr)return fr;
    var t=brut(o,f,l);
    if(!t)return fr;
    var e=o.tradEmp&&o.tradEmp[f+'.'+l];
    if(!e){
      // Ancienne traduction sans empreinte : gardée seulement si l'objet n'a jamais été repris par le système
      // (sinon c'est qu'elle n'a pas été refaite après un changement → français).
      return o.tradEmp?fr:t;
    }
    return e===RGL.empreinte(fr)?t:fr;
  };
  RGL.aJour=function(o,f,l){
    var fr=RGL.fr(o,f);
    if(!fr||l===RGL.SOURCE)return true;
    var e=o.tradEmp&&o.tradEmp[f+'.'+l];
    return !!(brut(o,f,l)&&e&&e===RGL.empreinte(fr));
  };
  RGL.ecrire=function(o,f,l,t,manuel){
    var v=o[f];
    t=String(t==null?'':t).trim();
    if(v&&typeof v==='object')v[l]=t;
    else{o.trad=o.trad||{};o.trad[f]=o.trad[f]||{};o.trad[f][l]=t;}
    o.tradEmp=o.tradEmp||{};
    o.tradEmp[f+'.'+l]=RGL.empreinte(RGL.fr(o,f));
    o.tradManuel=o.tradManuel||{};
    if(manuel)o.tradManuel[f+'.'+l]=true;else delete o.tradManuel[f+'.'+l];
    if(!Object.keys(o.tradManuel).length)delete o.tradManuel;
  };
  RGL.estManuel=function(o,f,l){return !!(o.tradManuel&&o.tradManuel[f+'.'+l]&&RGL.aJour(o,f,l));};

  // Sous-catégories : leur nom sert d'identifiant (it.subcat), la traduction est rangée dans la catégorie.
  RGL.porteurSous=function(c,sub){
    c.subTrad=c.subTrad||{};
    var p=c.subTrad[sub];
    if(!p||typeof p!=='object'){p=c.subTrad[sub]={};}
    p.nom=p.nom&&typeof p.nom==='object'?p.nom:{};
    p.nom.fr=sub;
    return p;
  };
  RGL.lireSous=function(c,sub,l){
    if(!c||!sub)return sub||'';
    var p=c.subTrad&&c.subTrad[sub];
    if(!p)return sub;
    if(!p.nom||typeof p.nom!=='object')return sub;
    p.nom.fr=sub;
    return RGL.lire(p,'nom',l);
  };

  // ── Inventaire des textes de la carte ───────────────────────────────────────────────────────────────
  // d = {cats, items, upsells, popups, sections}. Renvoie [{o, f, fr, type, contexte, cle}] pour chaque texte français
  // non vide. type : nom_plat, description, categorie, sous_categorie, variante, suggestion, popup, section.
  RGL.inventaire=function(d){
    var out=[];
    function add(o,f,type,contexte,cle){
      if(!o)return;
      var fr=RGL.normaliser(RGL.fr(o,f));
      if(!fr)return;
      out.push({o:o,f:f,fr:fr,type:type,contexte:contexte||'',cle:cle});
    }
    var cats=d.cats||[],nomCat={};
    cats.forEach(function(c){
      nomCat[c.id]=RGL.fr(c,'name');
      if(c.archived)return;
      add(c,'name','categorie','','cat:'+c.id+':name');
      add(c,'subtitle','description',nomCat[c.id],'cat:'+c.id+':subtitle');
    });
    var subs={};
    (d.items||[]).forEach(function(it){if(it.subcat&&!it.archived)subs[it.cat+'\u0001'+it.subcat]=true;});
    cats.forEach(function(c){(c.subcats||[]).forEach(function(s){if(s)subs[c.id+'\u0001'+s]=true;});});
    Object.keys(subs).forEach(function(k){
      var p=k.split('\u0001'),c=cats.filter(function(x){return x.id===p[0];})[0];
      if(!c||c.archived)return;
      add(RGL.porteurSous(c,p[1]),'nom','sous_categorie',nomCat[c.id],'sub:'+c.id+':'+p[1]);
    });
    (d.items||[]).forEach(function(it){
      if(it.archived)return;
      var ctx=nomCat[it.cat]||'';
      add(it,'name','nom_plat',ctx+(it.subcat?' › '+it.subcat:''),'item:'+it.id+':name');
      add(it,'desc','description',ctx+' — '+RGL.fr(it,'name'),'item:'+it.id+':desc');
      (it.priceVariants||[]).forEach(function(v,i){add(v,'label','variante',RGL.fr(it,'name'),'item:'+it.id+':var'+i);});
    });
    (d.upsells||[]).forEach(function(u){
      add(u,'title','suggestion','','upsell:'+u.id+':title');
      add(u,'message','suggestion','','upsell:'+u.id+':message');
    });
    (d.popups||[]).forEach(function(p){
      ['badge','title','desc'].forEach(function(f){add(p,f,'popup',RGL.fr(p,'title'),'popup:'+p.id+':'+f);});
    });
    var S=d.sections||{};
    Object.keys(S).forEach(function(k){
      var g=S[k];if(!g)return;
      ['title','subtitle','insertText','insertLinkLabel','aboutText','aboutText2'].forEach(function(f){add(g,f,'section','','section:'+k+':'+f);});
      (g.aboutBlocks||[]).forEach(function(b,i){if(b&&b.type==='text')add(b,'content','section','Notre histoire','section:'+k+':bloc'+(b.id||i));});
    });
    return out;
  };
  // Ce qui reste à traduire : [{entree, langues:[…]}]. forcer = tout refaire (sauf les corrections faites à la main).
  RGL.aTraduire=function(d,langues,forcer){
    langues=langues||RGL.cibles();
    var out=[];
    RGL.inventaire(d).forEach(function(e){
      var ls=langues.filter(function(l){
        if(RGL.estManuel(e.o,e.f,l))return false;
        return forcer||!RGL.aJour(e.o,e.f,l);
      });
      if(ls.length)out.push({entree:e,langues:ls});
    });
    return out;
  };
  // Couverture par langue : {langue:{total, aJour}}
  RGL.couverture=function(d,langues){
    langues=langues||RGL.cibles();
    var inv=RGL.inventaire(d),res={};
    langues.forEach(function(l){
      var n=0;inv.forEach(function(e){if(RGL.aJour(e.o,e.f,l))n++;});
      res[l]={total:inv.length,aJour:n};
    });
    return res;
  };

  // ── Appel du traducteur (Worker « restoglobal-traduction ») ─────────────────────────────────────────
  // opts = {url, jeton, lexique, langues, forcer, parLot, progres(fait,total)}. Les textes identiques sont envoyés une
  // seule fois. Renvoie {traduits (nombre de champs écrits), erreurs:[…]}.
  RGL.TAILLE_LOT=25;
  RGL.traduireManquants=async function(d,opts){
    opts=opts||{};
    var aFaire=RGL.aTraduire(d,opts.langues,opts.forcer);
    if(!aFaire.length)return {traduits:0,erreurs:[],restant:0};
    if(!opts.url)throw new Error('adresse du traducteur non réglée');
    // Regroupe par (texte, type, langues demandées)
    var groupes={},ordre=[];
    aFaire.forEach(function(a){
      var k=a.entree.type+'\u0001'+a.entree.fr;
      if(!groupes[k]){groupes[k]={id:'t'+ordre.length,fr:a.entree.fr,type:a.entree.type,contexte:a.entree.contexte,langues:{},cibles:[]};ordre.push(k);}
      a.langues.forEach(function(l){groupes[k].langues[l]=true;});
      groupes[k].cibles.push(a);
    });
    var lot=opts.parLot||RGL.TAILLE_LOT,traduits=0,erreurs=[],fait=0;
    for(var i=0;i<ordre.length;i+=lot){
      var paquet=ordre.slice(i,i+lot).map(function(k){return groupes[k];});
      var langues={};paquet.forEach(function(g){Object.keys(g.langues).forEach(function(l){langues[l]=true;});});
      var corps={
        langues:Object.keys(langues).map(function(code){var L=RGL.langue(code)||{};return {code:code,nom:L.nom||code};}),
        lexique:opts.lexique||'',
        textes:paquet.map(function(g){return {id:g.id,fr:g.fr,type:g.type,contexte:g.contexte};})
      };
      var rep;
      try{
        var r=await fetch(opts.url.replace(/\/+$/,'')+'/traduire',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(opts.jeton||'')},body:JSON.stringify(corps)});
        rep=await r.json().catch(function(){return null;});
        if(!r.ok||!rep||!rep.traductions)throw new Error((rep&&rep.error)||('code '+r.status));
      }catch(e){erreurs.push(e.message||String(e));if(/401|403|connexion|non autoris/i.test(String(e.message)))break;continue;}
      paquet.forEach(function(g){
        var t=rep.traductions[g.id]||{};
        g.cibles.forEach(function(a){
          a.langues.forEach(function(l){
            if(t[l]&&String(t[l]).trim()){RGL.ecrire(a.entree.o,a.entree.f,l,t[l],false);traduits++;}
          });
        });
      });
      fait+=paquet.length;
      if(opts.progres)try{opts.progres(fait,ordre.length);}catch(e){}
    }
    return {traduits:traduits,erreurs:erreurs,restant:RGL.aTraduire(d,opts.langues,false).length};
  };

  // ── Textes de l'interface de la carte ───────────────────────────────────────────────────────────────
  // Une clé par texte, toutes les langues de base remplies. Une langue ajoutée : textes rangés dans
  // design.json → langues_ui[langue][clé] (générés par le traducteur), sinon anglais.
  RGL.UI={
    fermer:{fr:'Fermer',en:'Close',it:'Chiudi',de:'Schließen',es:'Cerrar',zh:'关闭',ru:'Закрыть'},
    prix_nets:{fr:'Prix nets, service compris',en:'Prices include service',it:'Prezzi netti, servizio incluso',de:'Preise inklusive Bedienung',es:'Precios netos, servicio incluido',zh:'价格已含服务费',ru:'Цены включают обслуживание'},
    allergenes_lien:{fr:'Liste des allergènes',en:'Allergen list',it:'Elenco degli allergeni',de:'Allergenliste',es:'Lista de alérgenos',zh:'过敏原列表',ru:'Список аллергенов'},
    ici:{fr:'ici',en:'here',it:'qui',de:'hier',es:'aquí',zh:'点击查看',ru:'здесь'},
    menu_enfant:{fr:'Menu Enfant',en:'Kids Menu',it:'Menu Bambini',de:'Kindermenü',es:'Menú Infantil',zh:'儿童套餐',ru:'Детское меню'},
    supplements:{fr:'Ajoutez une touche gourmande',en:'Add a gourmet touch',it:'Aggiungi un tocco goloso',de:'Verfeinern Sie Ihre Pizza',es:'Añada un toque gourmet',zh:'为披萨加点料',ru:'Добавьте изысканности'},
    supplements_desc:{fr:'Personnalisez votre pizza selon vos envies',en:'Customise your pizza the way you like it',it:'Personalizza la tua pizza come preferisci',de:'Stellen Sie Ihre Pizza nach Ihrem Geschmack zusammen',es:'Personalice su pizza a su gusto',zh:'按您的口味自选配料',ru:'Соберите пиццу по своему вкусу'},
    voir_supplements:{fr:'Voir les suppléments',en:'See the extras',it:'Vedi le aggiunte',de:'Extras ansehen',es:'Ver los extras',zh:'查看加料',ru:'Посмотреть добавки'},
    a_partir_de:{fr:'À partir de',en:'From',it:'A partire da',de:'Ab',es:'Desde',zh:'起价',ru:'От'},
    nous_suivre:{fr:'Nous suivre',en:'Follow us',it:'Seguici',de:'Folgen Sie uns',es:'Síguenos',zh:'关注我们',ru:'Мы в соцсетях'},
    suivez_nous:{fr:'Suivez-nous',en:'Follow us',it:'Seguici',de:'Folgen Sie uns',es:'Síguenos',zh:'关注我们',ru:'Подписывайтесь на нас'},
    suivez_nous_titre:{fr:'Suivez-nous !',en:'Follow us!',it:'Seguici!',de:'Folgen Sie uns!',es:'¡Síguenos!',zh:'关注我们！',ru:'Подписывайтесь на нас!'},
    communaute:{fr:'Rejoignez notre communauté',en:'Join our community',it:'Unisciti alla nostra community',de:'Werden Sie Teil unserer Community',es:'Únase a nuestra comunidad',zh:'加入我们的社群',ru:'Присоединяйтесь к нашему сообществу'},
    avis_titre:{fr:'Vous avez aimé votre expérience ?',en:'Did you enjoy your visit?',it:'Ti è piaciuta la tua esperienza?',de:'Hat es Ihnen gefallen?',es:'¿Le ha gustado su experiencia?',zh:'您满意这次用餐体验吗？',ru:'Вам понравилось у нас?'},
    avis_texte:{fr:'Votre avis compte énormément pour nous et aide d\'autres gourmands à nous découvrir !',en:'Your review means a lot to us and helps other food lovers find us!',it:'La tua recensione conta moltissimo per noi e aiuta altri buongustai a scoprirci!',de:'Ihre Bewertung bedeutet uns viel und hilft anderen Genießern, uns zu entdecken!',es:'¡Su opinión es muy importante para nosotros y ayuda a otros amantes de la buena mesa a descubrirnos!',zh:'您的评价对我们非常重要，也能帮助更多美食爱好者发现我们！',ru:'Ваш отзыв очень важен для нас и помогает другим гурманам найти нас!'},
    avis_google:{fr:'Avis Google',en:'Google review',it:'Recensione Google',de:'Google-Bewertung',es:'Reseña en Google',zh:'谷歌评价',ru:'Отзыв в Google'},
    avis_tripadvisor:{fr:'Avis TripAdvisor',en:'TripAdvisor review',it:'Recensione TripAdvisor',de:'TripAdvisor-Bewertung',es:'Reseña en TripAdvisor',zh:'猫途鹰（TripAdvisor）评价',ru:'Отзыв на TripAdvisor'},
    donnez_avis:{fr:'Donnez-nous votre avis',en:'Leave us a review',it:'Lasciaci una recensione',de:'Bewerten Sie uns',es:'Déjenos su opinión',zh:'给我们留下评价',ru:'Оставьте отзыв'},
    allergenes:{fr:'Allergènes',en:'Allergens',it:'Allergeni',de:'Allergene',es:'Alérgenos',zh:'过敏原',ru:'Аллергены'},
    allergenes_avert:{fr:'⚠️ Nos plats sont préparés dans une cuisine où tous les allergènes sont présents. Une contamination croisée ne peut être totalement exclue. En cas d\'allergie sévère, informez notre équipe.',en:'⚠️ Our dishes are prepared in a kitchen where all allergens are present. Cross-contamination cannot be completely ruled out. If you have a severe allergy, please tell our team.',it:'⚠️ I nostri piatti sono preparati in una cucina in cui sono presenti tutti gli allergeni. Non si può escludere del tutto una contaminazione crociata. In caso di allergia grave, informa il nostro staff.',de:'⚠️ Unsere Gerichte werden in einer Küche zubereitet, in der alle Allergene vorhanden sind. Eine Kreuzkontamination kann nicht vollständig ausgeschlossen werden. Bei schweren Allergien informieren Sie bitte unser Team.',es:'⚠️ Nuestros platos se preparan en una cocina donde están presentes todos los alérgenos. No se puede descartar por completo la contaminación cruzada. En caso de alergia grave, informe a nuestro equipo.',zh:'⚠️ 我们的厨房会接触到所有过敏原，无法完全排除交叉污染的可能。如有严重过敏，请务必告知服务人员。',ru:'⚠️ Наши блюда готовятся на кухне, где присутствуют все аллергены. Перекрёстное загрязнение нельзя полностью исключить. При сильной аллергии сообщите об этом нашему персоналу.'},
    allergies_question:{fr:'Allergies ou intolérances ?',en:'Allergies or intolerances?',it:'Allergie o intolleranze?',de:'Allergien oder Unverträglichkeiten?',es:'¿Alergias o intolerancias?',zh:'有过敏或不耐受吗？',ru:'Есть аллергия или непереносимость?'},
    allergies_voir:{fr:'Consulter la liste des allergènes',en:'See the allergen list',it:'Consulta l\'elenco degli allergeni',de:'Allergenliste ansehen',es:'Consultar la lista de alérgenos',zh:'查看过敏原列表',ru:'Посмотреть список аллергенов'},
    plat:{fr:'Plat',en:'Dish',it:'Piatto',de:'Gericht',es:'Plato',zh:'菜品',ru:'Блюдо'},
    notre_histoire:{fr:'Notre Histoire',en:'Our Story',it:'La Nostra Storia',de:'Unsere Geschichte',es:'Nuestra Historia',zh:'我们的故事',ru:'Наша история'},
    aucun_produit:{fr:'Aucun produit dans cette section pour le moment.',en:'No items in this section yet.',it:'Nessun prodotto in questa sezione per il momento.',de:'In diesem Bereich gibt es derzeit keine Produkte.',es:'Por ahora no hay productos en esta sección.',zh:'本栏目暂无菜品。',ru:'В этом разделе пока нет блюд.'},
    'al.gluten':{fr:'Gluten',en:'Gluten',it:'Glutine',de:'Gluten',es:'Gluten',zh:'麸质',ru:'Глютен'},
    'al.crustaces':{fr:'Crustacés',en:'Crustaceans',it:'Crostacei',de:'Krebstiere',es:'Crustáceos',zh:'甲壳类',ru:'Ракообразные'},
    'al.oeufs':{fr:'Œufs',en:'Eggs',it:'Uova',de:'Eier',es:'Huevos',zh:'蛋类',ru:'Яйца'},
    'al.poisson':{fr:'Poisson',en:'Fish',it:'Pesce',de:'Fisch',es:'Pescado',zh:'鱼类',ru:'Рыба'},
    'al.arachides':{fr:'Arachides',en:'Peanuts',it:'Arachidi',de:'Erdnüsse',es:'Cacahuetes',zh:'花生',ru:'Арахис'},
    'al.soja':{fr:'Soja',en:'Soy',it:'Soia',de:'Soja',es:'Soja',zh:'大豆',ru:'Соя'},
    'al.lait':{fr:'Lait',en:'Milk',it:'Latte',de:'Milch',es:'Leche',zh:'乳制品',ru:'Молоко'},
    'al.noix':{fr:'Fruits à coque',en:'Tree nuts',it:'Frutta a guscio',de:'Schalenfrüchte',es:'Frutos de cáscara',zh:'坚果',ru:'Орехи'},
    'al.celeri':{fr:'Céleri',en:'Celery',it:'Sedano',de:'Sellerie',es:'Apio',zh:'芹菜',ru:'Сельдерей'},
    'al.moutarde':{fr:'Moutarde',en:'Mustard',it:'Senape',de:'Senf',es:'Mostaza',zh:'芥末',ru:'Горчица'},
    'al.sesame':{fr:'Sésame',en:'Sesame',it:'Sesamo',de:'Sesam',es:'Sésamo',zh:'芝麻',ru:'Кунжут'},
    'al.sulfites':{fr:'Sulfites',en:'Sulphites',it:'Solfiti',de:'Sulfite',es:'Sulfitos',zh:'亚硫酸盐',ru:'Сульфиты'},
    'al.mollusques':{fr:'Mollusques',en:'Molluscs',it:'Molluschi',de:'Weichtiere',es:'Moluscos',zh:'软体动物',ru:'Моллюски'},
    'al.lupin':{fr:'Lupin',en:'Lupin',it:'Lupini',de:'Lupinen',es:'Altramuces',zh:'羽扇豆',ru:'Люпин'},
    'ald.gluten':{fr:'Blé, seigle, orge, avoine…',en:'Wheat, rye, barley, oats…',it:'Frumento, segale, orzo, avena…',de:'Weizen, Roggen, Gerste, Hafer…',es:'Trigo, centeno, cebada, avena…',zh:'小麦、黑麦、大麦、燕麦等',ru:'Пшеница, рожь, ячмень, овёс…'},
    'ald.crustaces':{fr:'Crevettes, homard, crabe…',en:'Prawns, lobster, crab…',it:'Gamberi, astice, granchio…',de:'Garnelen, Hummer, Krabben…',es:'Gambas, bogavante, cangrejo…',zh:'虾、龙虾、螃蟹等',ru:'Креветки, омар, краб…'},
    'ald.oeufs':{fr:'Sous toutes formes',en:'In all forms',it:'In tutte le forme',de:'In jeder Form',es:'En todas sus formas',zh:'各种形式的蛋及蛋制品',ru:'В любом виде'},
    'ald.poisson':{fr:'Anchois, saumon, thon…',en:'Anchovies, salmon, tuna…',it:'Acciughe, salmone, tonno…',de:'Sardellen, Lachs, Thunfisch…',es:'Anchoas, salmón, atún…',zh:'凤尾鱼、三文鱼、金枪鱼等',ru:'Анчоусы, лосось, тунец…'},
    'ald.arachides':{fr:'Cacahuètes et dérivés',en:'Peanuts and peanut products',it:'Arachidi e derivati',de:'Erdnüsse und Erzeugnisse daraus',es:'Cacahuetes y derivados',zh:'花生及其制品',ru:'Арахис и продукты из него'},
    'ald.soja':{fr:'Lécithine de soja…',en:'Soy lecithin…',it:'Lecitina di soia…',de:'Sojalecithin…',es:'Lecitina de soja…',zh:'大豆卵磷脂等',ru:'Соевый лецитин…'},
    'ald.lait':{fr:'Mozzarella, parmesan, crème…',en:'Mozzarella, Parmesan, cream…',it:'Mozzarella, parmigiano, panna…',de:'Mozzarella, Parmesan, Sahne…',es:'Mozzarella, parmesano, nata…',zh:'马苏里拉奶酪、帕尔马干酪、奶油等',ru:'Моцарелла, пармезан, сливки…'},
    'ald.noix':{fr:'Noix, noisettes, amandes, pistaches…',en:'Walnuts, hazelnuts, almonds, pistachios…',it:'Noci, nocciole, mandorle, pistacchi…',de:'Walnüsse, Haselnüsse, Mandeln, Pistazien…',es:'Nueces, avellanas, almendras, pistachos…',zh:'核桃、榛子、杏仁、开心果等',ru:'Грецкие орехи, фундук, миндаль, фисташки…'},
    'ald.celeri':{fr:'Tiges, feuilles, graines',en:'Stalks, leaves, seeds',it:'Gambi, foglie, semi',de:'Stangen, Blätter, Samen',es:'Tallos, hojas, semillas',zh:'茎、叶、籽',ru:'Стебли, листья, семена'},
    'ald.moutarde':{fr:'Graines, feuilles, huile…',en:'Seeds, leaves, oil…',it:'Semi, foglie, olio…',de:'Samen, Blätter, Öl…',es:'Semillas, hojas, aceite…',zh:'芥菜籽、叶、油等',ru:'Семена, листья, масло…'},
    'ald.sesame':{fr:'Graines et huile',en:'Seeds and oil',it:'Semi e olio',de:'Samen und Öl',es:'Semillas y aceite',zh:'芝麻及芝麻油',ru:'Семена и масло'},
    'ald.sulfites':{fr:'Vins, charcuteries…',en:'Wine, cured meats…',it:'Vini, salumi…',de:'Wein, Wurstwaren…',es:'Vinos, embutidos…',zh:'葡萄酒、腌制肉类等',ru:'Вино, мясные деликатесы…'},
    'ald.mollusques':{fr:'Huîtres, moules, calmars…',en:'Oysters, mussels, squid…',it:'Ostriche, cozze, calamari…',de:'Austern, Muscheln, Tintenfisch…',es:'Ostras, mejillones, calamares…',zh:'牡蛎、贻贝、鱿鱼等',ru:'Устрицы, мидии, кальмары…'},
    'ald.lupin':{fr:'Farine et graines de lupin',en:'Lupin flour and seeds',it:'Farina e semi di lupini',de:'Lupinenmehl und -samen',es:'Harina y semillas de altramuz',zh:'羽扇豆粉及种子',ru:'Мука и семена люпина'}
  };
  // Textes d'interface propres à une page (ex. contenu du menu enfant) : ajoutés par la page, traduits de la même façon.
  RGL.ajouterUI=function(dico){Object.keys(dico||{}).forEach(function(k){RGL.UI[k]=dico[k];});};
  RGL.UI_LANGUES={}; // design.json → langues_ui : {langue:{clé:texte}}
  RGL.ui=function(cle,l){
    var d=RGL.UI[cle];
    if(!d)return cle;
    if(d[l])return d[l];
    var x=RGL.UI_LANGUES[l]&&RGL.UI_LANGUES[l][cle];
    if(x)return x;
    return d.en||d.fr;
  };
  // Clés d'interface sans texte pour une langue (pour une langue ajoutée).
  RGL.uiManquants=function(l){
    return Object.keys(RGL.UI).filter(function(k){return !RGL.UI[k][l]&&!(RGL.UI_LANGUES[l]&&RGL.UI_LANGUES[l][k]);});
  };
  // Traduit les textes d'interface manquants d'une langue (même traducteur). Renvoie l'objet {clé:texte} complété.
  RGL.traduireInterface=async function(l,opts){
    var manq=RGL.uiManquants(l);
    if(!manq.length)return RGL.UI_LANGUES[l]||{};
    var L=RGL.langue(l)||{};
    var r=await fetch(opts.url.replace(/\/+$/,'')+'/traduire',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(opts.jeton||'')},
      body:JSON.stringify({langues:[{code:l,nom:L.nom||l}],lexique:opts.lexique||'',textes:manq.map(function(k){return {id:k,fr:RGL.UI[k].fr,type:'interface',contexte:'texte de l\'interface d\'une carte de restaurant'};})})});
    var rep=await r.json().catch(function(){return null;});
    if(!r.ok||!rep||!rep.traductions)throw new Error((rep&&rep.error)||('code '+r.status));
    RGL.UI_LANGUES[l]=RGL.UI_LANGUES[l]||{};
    manq.forEach(function(k){var t=rep.traductions[k]&&rep.traductions[k][l];if(t)RGL.UI_LANGUES[l][k]=t;});
    return RGL.UI_LANGUES[l];
  };

  // Réglages lus dans design.json : langues, textes d'interface des langues ajoutées, lexique, adresse du traducteur.
  RGL.appliquerDesign=function(design){
    design=design||{};
    RGL.configurerLangues(design.langues);
    RGL.UI_LANGUES=(design.langues_ui&&typeof design.langues_ui==='object')?design.langues_ui:{};
    if(design.traduction_url)RGL.URL_TRADUCTEUR=design.traduction_url;
  };
  RGL.URL_TRADUCTEUR='';

  global.RGL=RGL;
})(typeof window!=='undefined'?window:globalThis);
