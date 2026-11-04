# Gesamtkonzept: Objekte, Auswahl, Bestand, Verbindungen

Stand: 02.11.2026. Umgesetzt in v169 bis v171, die Empfehlungen aus Abschnitt 17 gelten. Noch offen sind Fittings an Parallelrohren und die zusätzlichen Ideen aus Abschnitt 15. Abweichung: Shift mit Ziehen bleibt am Mac Verschieben der Ansicht, das Rechteck entsteht auch dort durch langes Drücken.

## 1. Kern in fünf Sätzen

1. **Alles im Raum ist ein Objekt:** Rohr, Fitting, Ebene, Bestandsstück. Jedes Objekt lässt sich gleich wählen, bewegen, sperren, ausblenden, kopieren und löschen.
2. **Punkte gehören zum Objekt.** Wer einen Punkt bearbeitet, verändert die Form. Wer das Objekt bearbeitet, verändert nur die Lage.
3. **Die Referenz ist immer das zuletzt Gewählte.** Sie bleibt stehen, alles andere richtet sich nach ihr. Das gilt für Messen, Ausrichten, Verteilen und Verbinden.
4. **Vor dem Bewegen sieht man, was sich bewegt.** Alles, was mitläuft, leuchtet schon beim Anfassen.
5. **Gesperrtes bewegt sich nie, Verbundenes bleibt zusammen.** Geht beides nicht zugleich, passiert nichts, und die App sagt, warum.

## 2. Was die Vorbilder lehren

| Quelle | Beobachtung | Folge für die App |
|---|---|---|
| Fusion | Fensterauswahl: von links nach rechts nur Umschlossenes, von rechts nach links auch Gekreuztes | Gleiche Regel beim Auswahlrechteck |
| Fusion | Trennt Ausrichten (einmalig) von Gelenken (dauerhaft). Laut Forum wirkt Ausrichten nicht parametrisch, Gelenke schon | Ausrichten bleibt einmalig. Dauerhaft ist nur die Verbindung |
| Fusion | Laut Forum bewegt „Verschieben“ bei einer starren Gruppe teils nur ein Teil, nicht die Gruppe | Genau dieses Verhalten vermeiden: Verbundenes läuft immer mit |
| Fusion | Drehpunkt nur je Befehl verschiebbar, nicht dauerhaft | Übernehmen: Drehpunkt gilt für die laufende Bewegung |
| Shapr3D | Der Mittelpunkt des Griffs ist der Ankerpunkt und lässt sich verschieben | Griffmitte antippen, Fangpunkt tippen, fertig |
| Shapr3D | Ausrichten: erstes Objekt wandert zum zweiten, danach Drehen und Spiegeln als Nachjustieren | Reihenfolge wie hier. Nachjustieren in derselben Leiste |
| Shapr3D | Doppeltipp wählt Verbundenes aus. Nutzer stören sich daran, dass man es nicht abschalten kann | Doppeltipp erweitert nur innerhalb eines Objekts, nie darüber hinaus |
| Shapr3D | Langes Drücken und Ziehen wählt einen Bereich. Nutzer wünschen sich das auch mit dem Finger | Rechteck mit dem Finger, kein Stift nötig |
| Shapr3D | Nutzer berichten: Rechteck taugt nicht, wenn Teile verteilt liegen und man zwischendurch die Ansicht drehen muss | Antippen muss eine Auswahl über Orbit und Zoom hinweg halten |
| Shapr3D | Bei überlappenden Teilen gibt es eine kleine Auswahlliste | Übernehmen für Fitting am Rohrende |
| Shapr3D | Ausrichten eines Objekts in einer Gruppe bewegt laut Nutzern nur das Objekt | Keine Gruppen, stattdessen Mehrfachauswahl und Strang |
| Apple Pages (iPad) | Objekt halten und mit zweitem Finger weitere antippen. Halten auf leerer Fläche zieht ein Rechteck. Oder Modus „Objekte auswählen“ mit „Fertig“ | Alle drei übernehmen, weil das iPhone-Nutzer schon kennen |
| SketchUp (iPad) | Langes Drücken startet Lasso oder Rechteck, die Zugrichtung entscheidet | Bestätigt das Muster |
| AutoCAD, Illustrator, Keynote | Kopieren mit Basispunkt, Ausrichten am Schlüsselobjekt, Verteilen mit Abstand. Aus meiner Kenntnis, nicht neu recherchiert | Vorlage für Kopieren, Ausrichten und Verteilen |

Einschränkung: Offizielle Hilfe zu iPad-Gesten fand ich kaum. Vieles stammt aus Foren, teils alt und widersprüchlich. Die Apps selbst habe ich nicht bedient.

## 3. Regeln gegen Überraschungen

1. **Tippen wählt, Ziehen ändert.** Tippen verändert nie Geometrie.
2. **Die Leiste nennt, was gewählt ist.** Was dort nicht steht, ist nicht gewählt.
3. **Die Referenz ist das Zuletztgewählte.** Sie ist kräftiger markiert und bleibt stehen.
4. **Ein Griff bewegt genau, was leuchtet.**
5. **Gesperrt heißt: bewegt sich nie, durch nichts.** Auch nicht durch Verbindungen oder Mitlaufen.
6. **Ausgeblendet heißt: nicht da.** Nicht wählbar, kein Fangziel, nicht messbar.
7. **Fangen verändert nur die Lage des Gezogenen,** nie seine Drehung und nie ein anderes Objekt. Einzige Ausnahme ist das Verbinden am Rohrende, und das meldet sich sichtbar.
8. **Was nicht geht, bleibt beim letzten gültigen Stand** und sagt den Grund in der Sprache des Handwerks.
9. **Jeder Befehl ist ein Schritt Rückgängig,** auch Ausrichten von 20 Objekten.
10. **Abbrechen hinterlässt nichts,** „Fertig“ verliert nichts.

## 4. Objekte und Ebenen der Auswahl

| | Rohr | Fitting | Ebene | Bestandsstück | Ursprung |
|---|---|---|---|---|---|
| Teile | Schenkel, Eckpunkte, Enden | Anschlüsse | keine | zwei Enden, Achse | keine |
| Tipp | Teil an dieser Stelle | Fitting | Ebene | Bestandsstück | Hinweis mit Lage |
| Doppeltipp | Ganzes Rohr | wie Tipp | wie Tipp | wie Tipp | keine |
| Verschieben, Drehen | Ja, als Ganzes | Ja | Nur Verschieben | Ja | Nein |
| Formändern | Über Teile | Nein | Größe | Nein | Nein |
| Sperren | Ja | Ja | Ja | Ja | immer fest |
| Ausblenden | Ja | Ja | Ja | Ja | Ja |
| Kopieren, Löschen | Ja | Ja | Ja | Ja | Nein |
| Fangziel, Messpunkt | Enden, Ecken | Anschlüsse | Fläche | Enden, Achse | Punkt |
| In Stückliste, Biegen | Ja | Stückliste | Nein | Nein | Nein |

**Tipp bleibt beim Teil,** weil das heutige Arbeiten so läuft und Shapr3D es ähnlich macht. Das ganze Rohr wählt der Doppeltipp oder der Knopf „Ganzes Rohr“ in der Leiste, damit niemand die Geste kennen muss.

**Einheitliche Leiste für jedes Objekt, immer in dieser Reihenfolge:**

`Verschieben | Drehen ‖ objektbezogene Knöpfe ‖ Kopieren | Sperren | Löschen`

Das Fitting hat diese Leiste heute fast. Sie wird zum Muster für alle. Ausblenden bleibt im Projektmanager.

## 5. Zwei Arten Schloss, eine Bedeutung

- **Objekt sperren** (Projektmanager, wie heute die Ebene): Das Objekt ist in 3D nicht mehr wählbar, bleibt Fangziel und Messpunkt und lässt sich über den Projektmanager löschen.
- **Punkt festhalten** (Rohrende, wie heute): Dieser Punkt bewegt sich nicht, das Rohr bleibt bearbeitbar.

Beide zeigen dasselbe Schloss und bedeuten dasselbe: Das bewegt sich nicht.

**Änderung am Rohr:** Heute wandert das ganze Rohr mit, wenn man ein Ende verschiebt und das andere lose ist. Das widerspricht Regel 4. Künftig bewegt ein Punkt nur sich selbst, die Schenkel gleichen aus. Das ganze Rohr bewegt nur die Auswahl „Ganzes Rohr“. Dafür darf der Anfang neuer Rohre nicht mehr automatisch gesperrt sein, sonst ließe sich kein Rohr als Ganzes bewegen. Der Schalter `moveWhole` entfällt.

## 6. Leeres Projekt und Ursprung

- Ein neues Projekt zeigt nur Raster und Ursprung. Eine ruhige Zeile sagt: „Mit + beginnen“. Der Reiter „Biegen“ sagt: „Noch kein Rohr im Projekt“.
- Der Ursprung erscheint als Punkt mit drei kurzen Achsen in Rot, Grün, Blau, wie das Origin in Fusion.
- Im Auge und als Zeile im Projektmanager lässt er sich ausblenden. Ausgeblendet ist er kein Fangziel.
- Das Wort „Nullpunkt“ entfällt, überall heißt es „Ursprung“.

**Aufwand:** Der Code setzt an sehr vielen Stellen voraus, dass immer ein aktuelles Rohr existiert. Das ist unsichtbar, aber die größte Vorarbeit.

## 7. Einfügen ohne Bezugspunkt

*Stand v208: wieder entfernt. Getippt wird nur auf Fangpunkte, der Ursprung ist immer einer.*

Der bestehende Befehl bekommt keinen neuen Modus, nur einen zusätzlichen Tipp. Die Aufforderung lautet: „Bezugspunkt wählen oder frei tippen“.

- **Tipp auf Fangpunkt:** wie heute.
- **Tipp auf freie Fläche:** Der Punkt landet auf der **Arbeitsebene** und rastet auf 10 mm.
- **Arbeitsebene:** eine gewählte Referenzebene, sonst der Boden (Z = 0). Die Leiste nennt sie.

Danach geht es wie gewohnt weiter: Versatz, Richtung, Länge. Das Objekt ist gewählt, und „Messen“ bringt es auf Maß. Ohne Arbeitsebene wäre die Tiefe eines Tipps im Raum unbestimmt, deshalb ist sie nötig.

## 8. Bestandsstücke

**Zweck:** vorhandene Leitungen erfassen, um daran neue auszurichten.

- **Anlegen:** `+` → „Bestandsrohr“. Rohrtyp oder Ø wählen, dann setzen wie jedes Objekt.
- **Form:** gerades Stück, 50 mm, Länge in den Einstellungen änderbar. Es hat keine Biegung, keine Schenkel und keine Maße zum Antippen.
- **Aussehen:** grau, mit offenen Schnittenden, damit es nie wie ein geplantes Rohr wirkt.
- **Bearbeiten:** nur Verschieben und Drehen, dazu die Knöpfe X, Y, Z für die Richtung. „Messen“ bringt es auf Maß.
- **Sperren:** wie bei Ebenen.
- **Fangen:** beide Enden und die **verlängerte Achse**. Die Achse erscheint gestrichelt, sobald ein Griff in die Nähe kommt. So fluchtet ein neues Rohr mit dem Bestand.
- **Biegen und Stückliste:** kommen dort nicht vor.

## 9. Mehrfachauswahl

Es gibt mehrere Wege, die alle zum selben Zustand führen:

| Weg | Gerät | Wirkung |
|---|---|---|
| Knopf „Auswählen“ in der Navigationsleiste | Alle | Schaltet Mehrfachauswahl ein: Jeder Tipp fügt hinzu oder nimmt weg. Orbit und Zoom laufen weiter |
| Langes Drücken auf ein Objekt | Touch | Startet die Mehrfachauswahl mit diesem Objekt |
| Objekt halten, zweiter Finger tippt weitere an | Touch | Wie in Pages, für Geübte |
| Langes Drücken auf freier Fläche, dann ziehen | Touch | Rechteck. Nach rechts nur Umschlossenes, nach links auch Gekreuztes |
| Shift oder Cmd plus Klick, Ziehen mit Shift | Mac | Hinzufügen und Rechteck |
| Zeilen im Projektmanager | Alle | Bei aktiver Mehrfachauswahl fügt ein Tipp hinzu |

- Gewählt werden immer **ganze Objekte**, keine Schenkel.
- **Die Überschrift zählt:** „4 Objekte · Bezug: CLA-6M“.
- **Das Zuletztgewählte** ist kräftig markiert, alle anderen zart. Erneutes Antippen eines Gewählten nimmt es heraus. Ein Knopf „Als Bezug“ gibt es nicht, weil die Reihenfolge reicht.
- **Beenden:** Tipp in den freien Raum oder erneut auf „Auswählen“.
- **Überlappung:** Liegen an einer Stelle mehrere Objekte, etwa Fitting und Rohrende, erscheint eine kleine Liste zur Wahl. Das löst auch das heutige Problem am Rohrende.

**Leiste:** `Verschieben | Drehen ‖ Ausrichten | Verteilen ‖ Kopieren | Sperren | Löschen`

**Bewegen:** Der Griff sitzt in der Mitte der Auswahl. Die Griffmitte antippen und einen Fangpunkt wählen setzt den Drehpunkt für diese Bewegung. Gesperrtes bleibt stehen, die Überschrift nennt es: „1 gesperrt, bleibt stehen“.

## 10. Kopieren und Einfügen mit Referenzpunkt

Es gibt nur noch einen Befehl, „Duplizieren“ geht darin auf.

1. **Kopieren** in der Leiste. Aufforderung: „Referenzpunkt wählen“. Angeboten werden alle Fangpunkte der Auswahl.
2. **Zielpunkt tippen,** auf einen Fangpunkt. Ein blasses Abbild zeigt vorher das Ergebnis.
3. Die Kopie liegt dort. Weitere Ziele setzen weitere Kopien, „Fertig“ beendet.

- **In andere Projekte:** Die Zwischenablage bleibt erhalten. `+` → „Einfügen“ fragt nur nach dem Zielpunkt.
- **Mitkopiert werden:** Parallelrohre, Farbe und Rohrtyp. Sperren nicht. Verbindungen nur, wenn beide Seiten mitkopiert werden.
- **Namen:** Kopien erhalten den nächsten freien Namen.

## 11. Ausrichten und Verteilen

**Horizontal und vertikal sind in 3D mehrdeutig,** deshalb nennt die App Achsen. Das passt auch zum Rest der App. Z entspricht „Höhe“.

**Ausrichten** (ab 2 Objekten):

1. „Ausrichten“ tippen. Die Leiste zeigt X, Y, Z. Am Objekt erscheint je ein **Bezugspunkt**.
2. Achse tippen. Alle Objekte gleiten sofort in der Vorschau auf den Wert der Referenz, mehrere Achsen lassen sich kombinieren.
3. „Fertig“ übernimmt, „Abbrechen“ setzt zurück.

**Bezugspunkt je Objekt:** Fitting: Mitte. Bestandsstück: Achsmitte. Ebene: ihre Fläche. Rohr: das Ende, das dem Tipp am nächsten lag. Tippen auf einen Bezugspunkt wechselt reihum durch die Punkte des Objekts, etwa zu einem Anschluss.

**Verteilen** (ab 2 Objekten):

1. „Verteilen“ tippen. Die Leiste zeigt Achse, Abstand und „Gleichmäßig“.
2. Die Achse ist vorgewählt: die längste Ausdehnung der Auswahl.
3. **Abstand eingeben:** Die Referenz bleibt stehen, die anderen reihen sich in ihrer jetzigen Folge von ihr aus auf. Gemessen wird wie überall Achsmaß, von Bezugspunkt zu Bezugspunkt.
4. **Gleichmäßig** (ab 3 Objekten): Die beiden äußeren bleiben stehen, die übrigen verteilen sich dazwischen.

Beides ist einmalig, es entsteht keine Beziehung. Das Maß dazu steht live im Raum und ist antippbar wie jedes andere.

**Folge für „Messen“:** Heute bleibt der erste Punkt fest. Das widerspricht „Referenz ist das Zuletztgewählte“. Messen dreht sich deshalb um: Erst tippt man, was wandern soll, dann den Bezug. Das entspricht auch Fusion und Shapr3D.

## 12. Verbindungen

Das ist der einzige dauerhafte Zusammenhalt, Maßbezüge bleiben stillgelegt.

**Grundgedanke:** Rohrende und Anschluss werden **ein Punkt**. Es gibt keine zwei Dinge, die aufeinander reagieren, sondern einen gemeinsamen Knoten. Daraus ergibt sich das Verhalten fast von selbst.

**Entstehen und Lösen**

- Andocken ist Verbinden, beim Ziehen wie über den Knopf. Am Punkt erscheint ein Verbindungssymbol, die Überschrift sagt „Verbunden mit Rohr 3“.
- „Lösen“ in der Leiste trennt, Rückgängig ebenso. Einfaches Wegziehen trennt **nicht**.
- Ein anderer Durchmesser wird gemeldet, aber nicht verboten.

**Verhalten**

| Aktion | Ergebnis |
|---|---|
| Rohrende verschieben | Fitting läuft mit, behält Drehung um die Rohrachse |
| Letzten Schenkel drehen oder ändern | Fitting folgt in Lage und Richtung |
| Fitting verschieben | Rohrende läuft mit, die Schenkel gleichen aus |
| Fitting drehen | Nur um die Rohrachse. Sind zwei Rohre verbunden, gesperrt mit Hinweis |
| Ganzes Rohr bewegen | Verbundene Fittings laufen starr mit |
| Winkelfitting mit zwei Rohren verschieben | Beide Rohrenden laufen mit, beide Rohre gleichen aus |
| Rohr ist gesperrt oder Ende festgehalten | Das Fitting ist es damit auch |
| Ausgleich unmöglich | Nichts bewegt sich, Hinweis nennt das Rohr |
| Rohr löschen | Fitting bleibt stehen, Verbindung ist weg |
| Fitting löschen | Rohr bleibt, Verbindung ist weg |

**Strang:** Der Knopf „Ganzer Strang“ wählt alles, was über Verbindungen zusammenhängt. So lässt sich eine ganze Leitung starr verschieben. Ohne ihn verformen sich beim Bewegen die Nachbarrohre, und das soll bewusst bleiben.

**Parallelrohre:** Fittings können auch an ihren Enden verbunden werden. Sie folgen dann dem Parallelrohr. Das Rohrende wandert aber nicht mit dem Fitting, weil Parallelrohre nur dem Hauptrohr folgen. Der Griff erklärt das beim Antippen.

**Bestand:** Fittings lassen sich auch an Bestandsstücke anschließen. Beim gesperrten Stück bleibt der Punkt fest.

## 13. Gesten im Überblick

| Geste | Wirkung |
|---|---|
| Tipp | Teil oder Objekt wählen, im Auswahlmodus hinzufügen |
| Tipp auf freie Fläche | Abwählen, im Auswahlmodus nichts |
| Doppeltipp | Ganzes Rohr |
| Ein Finger ziehen, frei | Drehen |
| Ein Finger ziehen, am Griff | Bewegen |
| Zwei Finger | Verschieben und Zoomen |
| Langes Drücken auf Objekt | Mehrfachauswahl beginnen |
| Langes Drücken auf frei, ziehen | Auswahlrechteck |
| Halten plus zweiter Finger | Weitere hinzufügen |

Jede Geste hat einen sichtbaren Knopf als Gegenstück. Niemand muss eine Geste kennen.

## 14. Heutige Unstimmigkeiten, die dabei verschwinden

| Heute | Künftig |
|---|---|
| Messen: erster Punkt fest | Letzter Punkt fest |
| Ende verschieben bewegt bei losem Anfang das ganze Rohr | Punkt bewegt nur sich |
| Fitting hat kein Schloss | Jedes Objekt hat eines |
| Duplizieren versetzt fest um 60 mm in Z | Kopieren mit Zielpunkt |
| „Angedockt“ geht beim Abwählen verloren | Verbindung ist gespeichert |
| Fitting am Rohrende schwer antippbar | Auswahlliste bei Überlappung |
| Neue Rohre haben immer einen gesperrten Anfang | Nichts ist ungefragt gesperrt |
| Nullpunkt nur im Befehl sichtbar | Ursprung immer sichtbar, ausblendbar |
| Unterschiedliche Leisten je Objekt | Eine Leiste |
| Ausgeblendetes teils unklar beim Fangen | Ausgeblendet heißt nicht da |

## 15. Zusätzliche Ideen

- **Reihe:** In „Verteilen“ eine Anzahl eingeben und Kopien erzeugen. Hilfreich für Schellen, Fittings und Bestand. Fusion und Shapr3D haben das als Muster.
- **Bestand erfassen in Serie:** Nach dem Setzen bleibt der Befehl offen, das nächste Stück übernimmt Richtung und Rohrtyp.
- **Parallel zum Bestand:** Ein Parallelrohr-Bündel kann am Bestandsstück beginnen.
- **Fittings in der Biegeanleitung:** Der Zuschnitt zeigt, welches Fitting an welchem Ende sitzt.
- **Materialprüfung:** Warnung bei offenen Rohrenden und unverbundenen Anschlüssen.
- **Zwei-Finger-Tipp für Rückgängig,** aus Zeichen-Apps bekannt. Nur als Zugabe, auf dem Baustellen-iPhone kann es stören.
- **Bewusst nicht:** Gruppen. Sie erzeugen bei den Vorbildern genau die Überraschungen, die hier vermieden werden sollen.

## 16. Reihenfolge der Umsetzung

| Schritt | Inhalt | Aufwand | Risiko |
|---|---|---|---|
| 0 | Fundament: Projekt ohne Rohr, einheitliches Auswahl- und Objektmodell | Groß | Hoch, berührt fast alles, ohne sichtbaren Nutzen |
| 1 | Leeres Projekt, Ursprung, Einfügen ohne Bezug | Klein | Gering |
| 2 | Regeln angleichen: Messen drehen, Rohrpunkt-Verhalten, Schloss für alle, eine Leiste | Mittel | Mittel, ändert Gewohntes |
| 3 | Bestandsstücke mit Achsenfang | Mittel | Gering |
| 4 | Mehrfachauswahl, gemeinsames Bewegen, Auswahlliste | Mittel | Mittel |
| 5 | Kopieren und Einfügen mit Referenzpunkt | Mittel | Gering |
| 6 | Ausrichten und Verteilen | Mittel | Gering |
| 7 | Verbindungen, danach Strang | Groß | Hoch, die Rechnung muss ketten und Grenzen sauber erkennen |
| 8 | Zusätzliche Ideen nach Bedarf | je klein | Gering |

Schritt 0 und 2 kommen zuerst, weil alles andere darauf aufbaut. Jeder Schritt ist für sich nutzbar. Vor Schritt 7 sollte die Rechnung für Verkettungen erst als Prototyp laufen.

## 17. Offene Entscheidungen

1. **Messen umdrehen:** Künftig bleibt der zweite Punkt fest. *Empfehlung: ja, sonst gelten zwei Regeln.*
2. **Andocken ist Verbinden:** Kein extra Schritt. *Empfehlung: ja, das erwartet man.*
3. **Rohranfang nicht mehr automatisch sperren,** auch bei vorhandenen Rohren einmalig lösen. *Empfehlung: ja. Bewusst gesetzte Sperren lassen sich davon nicht unterscheiden, also danach prüfen.*
4. **Tipp wählt Teil, Doppeltipp das ganze Rohr.** *Empfehlung: ja, es bleibt, wie du heute arbeitest.*
5. **Bestandsstück:** Ø über Rohrtypen, Länge fest 50 mm mit Einstellung. *Empfehlung: ja.*

## 18. Bauteil-Editor: Anschlüsse und Achsen aus der Geometrie

Bisher wurden Anschlüsse geraten und mit pauschalen Feldern („Tiefe bis Rohranschlag“) nachgestellt. Das ist ungenau und für Schellen oder andere Teile unbrauchbar. Der Editor macht das Modell selbst zur Eingabe.

**Vorbild:** Fusion 360. Dort heißt das „Joint Origin“ (ein Verbindungspunkt mit Richtung, gefangen an Kreismitten, Kanten und Flächen), dazu Konstruktionsachsen und -punkte und „Messen“ (ein oder zwei Elemente wählen, Werte erscheinen). Übernommen wird genau das, reduziert auf Rohranschlüsse.

**Geometrie lesen (partgeom.js).** Eine GLB-Datei ist nur ein Dreiecksnetz. Daraus wird einmal beim Öffnen gewonnen:
- **Kanten:** Dreieckskanten mit Knick über 32°. Facettierte Zylinder bleiben glatt, echte Kanten bleiben Kanten.
- **Kreise:** Kantenzüge, deren Punkte auf einem Kreis in einer Ebene liegen. Geteilte Ringe werden zusammengelegt. Jeder Kreis hat Mittelpunkt, Normale und Ø.
- **Gerade Kanten:** mit Endpunkten und Mitte.
- **Ebene Flächen:** zusammenhängende Dreiecke gleicher Normale, mit Mitte und Normale.
- **Fangpunkte:** Kreismitten, Eckpunkte, Kantenmitten, Flächenmitten.

**Der Editor** öffnet sich ganzseitig aus Einstellungen → Fittings („Bearbeiten“) und direkt nach dem Import. Oben Name, Rückgängig, Fertig. In der Mitte das Modell, drehbar und zoombar wie die 3D-Ansicht. Unten eine Symbolleiste mit den Befehlen, darüber die Befehlsleiste mit Aufforderung und Feldern. Links eine Liste: Anschlüsse, Achsen, Punkte; Antippen wählt, Löschen dort.

**Immer gilt:** Unter der Maus hebt sich hervor, was der Befehl gerade annimmt, mit kurzer Beschriftung („Kreis Ø 6,00“, „Kreismitte“, „Fläche“). „Durchsicht“ macht das Modell durchscheinend, damit innere Kreise (Bohrungsstufen) erreichbar sind; der Anschlag-Schritt schaltet sie von selbst ein.

**Befehle:**
1. **Messen:** ein Element zeigt seine Werte (Kreis: Ø und Mitte, Kante: Länge, Fläche: Normale und Inhalt, Punkt: Koordinaten). Zwei Elemente zeigen Abstand mit ΔX, ΔY, ΔZ, bei Achsen und Flächen auch Winkel und Abstand entlang der Achse. Die Messlinie steht im Bild.
2. **Anschluss:** (a) Öffnung wählen: Kreis an der Mündung oder eine Achse. Richtung nach außen ergibt sich von selbst (die Seite ohne Material), ⇄ kehrt um. Ø kommt aus der Bohrung an der Öffnung und rastet auf übliche Rohrmaße. (b) Anschlag wählen: Kreis, Fläche oder Punkt; der Abstand entlang der Achse ist die Tiefe. Kreise auf derselben Achse werden mit ihrer Tiefe angeboten. Oder die Tiefe tippen. Ein durchsichtiges Rohrstück zeigt das Ergebnis.
3. **Achse:** aus einem Kreis (durch die Mitte, senkrecht), einer geraden Kante, einer ebenen Fläche (Normale durch die Mitte) oder zwei Punkten.
4. **Punkt:** ein Fangpunkt, verschoben um X, Y, Z oder um ein Maß entlang einer Achse. Punkte und Achsen dienen als Bezug für Anschlüsse, Messungen und weitere Achsen.
5. **Drehachse:** jede Achse und jeder Anschluss lässt sich in der Liste als Drehachse festlegen; so dreht das Fitting im Raum.

**Automatik:** Beim Import schlägt der Editor Anschlüsse vor: Kreis an einer Außenfläche = Öffnung, die erste Stufe nach innen, an der die Bohrung enger wird = Anschlag. Bei CLA-6M und CUA-6M ergibt das Ø 6 und 15,3 mm. Vorschläge sind normale Anschlüsse und lassen sich ändern.

**Daten:** Ein Anschluss bleibt `{ mouth, d, depth, p, D }`; neu ist `src` (woraus er entstand) und ein Name. Achsen und Punkte liegen in `aux`. Die Drehachse ist entweder wie bisher ein Kürzel („p0“, „x“) oder eine eigene Achse `{ A, n }`. Alte Daten bleiben gültig.

**Später (vorbereitet, nicht gebaut):** Schellen und andere Teile nutzen denselben Editor. Ein Anschluss bekommt dann eine Art: *Ende* (Rohr steckt bis zum Anschlag, wie heute) oder *Durchgang* (Rohr läuft hindurch, Schelle). Dazu Befestigungspunkte für Wand oder Schiene.

## Quellen

- [Fusion: Auswahl im Fenster, Freihand, Malen](https://help.autodesk.com/view/fusion360/ENU/?guid=SLD-SELECTION)
- [Fusion: Fläche auswählen](https://www.autodesk.com/products/fusion-360/blog/tip-tuesday-3-ways-to-select-an-area-in-fusion-360/)
- [Fusion: Modell am Koordinatensystem ausrichten](https://help.autodesk.com/view/fusion360/ENU/?caas=caas%2Fsfdcarticles%2Fsfdcarticles%2FHow-To-align-a-model-or-assembly-to-the-WCS-in-Fusion-360.html)
- [Fusion-Forum: Ausrichten und Gelenke](https://forums.autodesk.com/t5/fusion-support-forum/alignment-joint-challenge/m-p/13854732)
- [Fusion-Forum: Starre Gruppe und Verschieben](https://forums.autodesk.com/t5/fusion-design-validate-document/rigid-group-broken-by-move-and-align-tool/td-p/10500844)
- [Fusion-Forum: Drehpunkt beim Kopieren und Verschieben](https://forums.autodesk.com/t5/fusion-support-forum/copy-amp-move-pivot-point/td-p/12381820)
- [Shapr3D: 3D-Ausrichten](https://shapr3d.com/blog/introducing-3d-alignment)
- [Shapr3D: Verschieben und Drehen](https://support.shapr3d.com/hc/en-us/articles/7874396289308-Move-Rotate-3D)
- [Shapr3D: Tastenkürzel und Gesten](https://support.shapr3d.com/hc/en-us/articles/7873906073884-Keyboard-shortcuts-gestures-and-hotkeys)
- [Shapr3D: Muster, Duplizieren](https://support.shapr3d.com/hc/en-us/articles/18568693265820-Quick-concepts-part-2-Iterate-and-modify)
- [Shapr3D: Bedingungen](https://www.shapr3d.com/product/cad-constraints)
- [Shapr3D-Forum: Viele Objekte wählen](https://discourse.shapr3d.com/t/mass-selecting-elements-bodies-objects/3769)
- [Shapr3D-Forum: Gruppen bewegen](https://discourse.shapr3d.com/t/select-multiple-objects-and-group-move-a-complete-group/1652)
- [Shapr3D-Forum: Bereichsauswahl mit dem Stift](https://discourse.shapr3d.com/t/ipad-4-6-area-selection-tool-for-apple-pencil/13357)
- [Fusion 360: Joint Origin](https://help.autodesk.com/view/fusion360/ENU/?guid=ASM-JOINT-ORIGIN)
- [Fusion 360: Measure](https://help.autodesk.com/view/fusion360/ENU/?guid=ASM-MEASURE)
- [Shapr3D-Forum: Doppeltipp abschalten](https://discourse.shapr3d.com/t/is-there-a-way-to-disable-double-tap-to-select-all/25102)
- [Shapr3D-Forum: Genauere Auswahl, Liste bei Überlappung](https://discourse.shapr3d.com/t/5-830-more-precise-selections/37197)
- [Shapr3D-Forum: Ausrichten in Gruppen](https://discourse.shapr3d.com/t/aligning-grouped-objects/26065)
- [Apple Pages iPad: Mehrere Objekte wählen](https://support.apple.com/guide/pages-ipad/aside/tanb94f16be3/15.2/ipados/1.0)
- [SketchUp iPad: Auswahlwerkzeug](https://help.sketchup.com/de/sketchup-ipad/select-tool)
