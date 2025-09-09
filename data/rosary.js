// Central rosary data: full prayer texts and mystery clauses (German)

export const prayers = {
  signOfCross: 'Im Namen des Vaters und des Sohnes und des Heiligen Geistes. Amen.',
  creed:
    'Ich glaube an Gott, den Vater, den Allmächtigen, den Schöpfer des Himmels und der Erde. Und an Jesus Christus, seinen eingeborenen Sohn, unsern Herrn, empfangen durch den Heiligen Geist, geboren von der Jungfrau Maria, gelitten unter Pontius Pilatus, gekreuzigt, gestorben und begraben, hinabgestiegen in das Reich des Todes, am dritten Tage auferstanden von den Toten, aufgefahren in den Himmel; er sitzt zur Rechten Gottes, des allmächtigen Vaters; von dort wird er kommen, zu richten die Lebenden und die Toten. Ich glaube an den Heiligen Geist, die heilige katholische Kirche, Gemeinschaft der Heiligen, Vergebung der Sünden, Auferstehung der Toten und das ewige Leben. Amen.',
  ourFather:
    'Vater unser im Himmel, geheiligt werde dein Name. Dein Reich komme. Dein Wille geschehe, wie im Himmel so auf Erden. Unser tägliches Brot gib uns heute. Und vergib uns unsere Schuld, wie auch wir vergeben unseren Schuldigern. Und führe uns nicht in Versuchung, sondern erlöse uns von dem Bösen. Amen.',
  hailMaryPart1Base:
    'Gegrüßet seist du, Maria, voll der Gnade, der Herr ist mit dir. Du bist gebenedeit unter den Frauen, und gebenedeit ist die Frucht deines Leibes, Jesus, ',
  hailMaryPart1NoClause:
    'Gegrüßet seist du, Maria, voll der Gnade, der Herr ist mit dir. Du bist gebenedeit unter den Frauen, und gebenedeit ist die Frucht deines Leibes, Jesus.',
  hailMaryPart2:
    'Heilige Maria, Mutter Gottes, bitte für uns Sünder, jetzt und in der Stunde unseres Todes. Amen.',
  gloria:
    'Ehre sei dem Vater und dem Sohn und dem Heiligen Geist, wie im Anfang, so auch jetzt und allezeit und in Ewigkeit. Amen.',
  fatima:
    'O mein Jesus, verzeih uns unsere Sünden; bewahre uns vor dem Feuer der Hölle; führe alle Seelen in den Himmel, besonders jene, die deiner Barmherzigkeit am meisten bedürfen.',
};

export const rosarySets = {
  freudenreich: {
    key: 'freudenreich',
    title: 'Freudenreicher Rosenkranz',
    clauses: [
      'den du, o Jungfrau, vom Heiligen Geist empfangen hast',
      'den du, o Jungfrau, zu Elisabeth getragen hast',
      'den du, o Jungfrau, zu Bethlehem geboren hast',
      'den du, o Jungfrau, im Tempel aufgeopfert hast',
      'den du, o Jungfrau, im Tempel wiedergefunden hast',
    ],
  },
  schmerzhaft: {
    key: 'schmerzhaft',
    title: 'Schmerzhafter Rosenkranz',
    clauses: [
      'der für uns Blut geschwitzt hat',
      'der für uns gegeißelt worden ist',
      'der für uns mit Dornen gekrönt worden ist',
      'der für uns das schwere Kreuz getragen hat',
      'der für uns gekreuzigt worden ist',
    ],
  },
  glorreich: {
    key: 'glorreich',
    title: 'Glorreicher Rosenkranz',
    clauses: [
      'der von den Toten auferstanden ist',
      'der in den Himmel aufgefahren ist',
      'der den Heiligen Geist gesandt hat',
      'der dich, o Jungfrau, in den Himmel aufgenommen hat',
      'der dich, o Jungfrau, im Himmel gekrönt hat',
    ],
  },
  lichtreich: {
    key: 'lichtreich',
    title: 'Lichtreicher Rosenkranz',
    clauses: [
      'der von Johannes im Jordan getauft worden ist',
      'der sich bei der Hochzeit zu Kana offenbart hat',
      'der uns das Reich Gottes verkündet hat',
      'der auf dem Berg verklärt worden ist',
      'der uns die Eucharistie geschenkt hat',
    ],
  },
};

export const setOrder = ['freudenreich', 'schmerzhaft', 'glorreich', 'lichtreich'];
