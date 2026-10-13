# Partage

Partage sert à montrer un écran à plusieurs personnes, par exemple un ordinateur et des iPhone. Une personne crée une session et obtient un code court. Jusqu'à quatre invités le rejoignent, cinq personnes en tout. Une seule envoie l'écran ; les autres regardent. Les rôles peuvent s'inverser.

La capture ne démarre qu'après un appui sur le bouton de partage. C'est à ce moment que le navigateur affiche sa demande d'autorisation. Il n'y a pas de contrôle à distance, et rien n'est capturé en arrière-plan.

Sur iPhone et iPad, Safari ne peut pas capturer l'écran. Aucun site n'y a accès, Chrome compris, parce que ces navigateurs passent par le même moteur. Le téléphone sert à regarder l'écran partagé depuis l'ordinateur. Sur iPad, « Plein écran » utilise le plein écran du système quand Safari l'accepte.

## Lancer

```bash
npm install
npm run dev
```

L'application écoute sur [http://127.0.0.1:43129](http://127.0.0.1:43129).

## À plusieurs

1. Sur le premier appareil, ouvrez Partage et touchez « Créer une session ». Notez le code.
2. Chaque invité ouvre la même adresse, entre le code et touche « Rejoindre ». Au cinquième participant, la session est complète.
3. La personne qui montre son écran appuie sur « Je partage mon écran » et accepte la demande du navigateur. Chrome propose aussi le son de l'onglet ou du système : s'il y a une piste audio, les invités l'entendent. Sinon, l'image continue seule. Sur l'image reçue, « Plein écran » agrandit le partage.
4. Sur iPhone ou iPad, « Je partage mon écran » reste indisponible. Touchez « Je regarde » : l'image vient de l'ordinateur.
5. Pour changer qui partage, un autre ordinateur appuie sur « Partager mon écran à la place » et accepte à son tour. Un iPhone ne peut pas prendre le relais de l'écran. Un invité qui quitte ne coupe pas l'image pour les autres.
6. Le coin bas droite de l'image sert de chat. Les messages restent petits, sur un fond transparent, y compris en plein écran. Ils s'effacent au bout de 10 secondes. Un nouveau message les réaffiche, avec l'historique au-dessus, pendant 10 secondes.

Pour ajouter Partage à l'écran d'accueil d'un iPhone ou d'un iPad : dans Safari, Partager, puis « Sur l'écran d'accueil ».

La vidéo passe directement d'un navigateur à l'autre (WebRTC), avec le serveur STUN public `stun:stun.l.google.com:19302`. La personne qui partage ouvre une liaison vers chaque invité. Les codes et la signalisation restent en mémoire du serveur : un redémarrage efface les sessions. Si un réseau bloque le pair à pair, l'image peut ne pas s'établir.

Le navigateur n'autorise la vidéo qu'en adresse sécurisée (`https` ou `localhost`). Plusieurs fenêtres sur le même ordinateur fonctionnent via localhost. Un téléphone qui ouvre l'adresse en simple `http` sur le réseau local verra un message d'erreur : il lui faut une adresse `https`.
