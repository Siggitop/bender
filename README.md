# Rohrbiegen

Web-App (PWA) zum Aufmessen von Rohrleitungen im Achsmaß und Biegen mit der Handbiegezange.
Zeigt das Rohr in 3D, berechnet Zuschnitt und Strichpositionen und führt Schritt für Schritt durch die Biegungen.
Läuft im Browser, auch offline, und lässt sich auf dem iPhone über „Zum Home-Bildschirm“ wie eine App installieren.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Oberfläche |
| `app.js` | Eingabe, 3D-Ansicht, Gimbal, Anleitung, Zangen |
| `geometry.js` | Biegerechnung (Tangente, Bogen, Zuschnitt, Strichpositionen, Kollisionen) |
| `fittings.js` | Fittings: GLB lesen, Anschlüsse erkennen, Modelle im Browser speichern |
| `site.js` | Baustelle: Raum (Grundriss → Wände, Boden, Decke), Schellen nach Abstandsregeln, Bohrpunkte, Rohrbündel (Parallelrohre), Zuschnitt aus Stangen |
| `version.js` | Versionsnummer (bei jeder Änderung erhöhen) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Offline-Betrieb und Installation als App |

Es gibt keinen Build-Schritt und keine Abhängigkeiten – die Dateien werden direkt ausgeliefert.

## Lokal starten

```bash
python3 -m http.server 8765
```

Dann `http://localhost:8765` öffnen. Im selben WLAN geht auch `http://<IP-des-Macs>:8765` vom iPhone aus
(dort ohne Offline-Betrieb, dafür braucht iOS HTTPS).

## Veröffentlichen mit GitHub Pages

Einstellungen → Pages → „Deploy from a branch“ → Branch `main`, Ordner `/ (root)`.
Die App ist danach unter `https://<benutzername>.github.io/<repository>/` erreichbar.

Bei jeder Änderung die Versionsnummer in `version.js` um 1 erhöhen. Die App zeigt sie an (oben rechts bzw. im Reiter
„Zangen“), vergleicht sie beim Öffnen mit dem Server und blendet bei einer neueren Version „Neue Version … – tippen zum Laden“ ein.

## Bedienung in Kürze

Reiter: **3D · Biegen · Einstellungen**. Ein Projekt ist eine Szene mit mehreren Rohren und Referenzebenen.

- **3D:** Gerade antippen = Längenpfeil, Eckpunkt antippen = Drehringe und Lage des Bündels, anderes Rohr antippen = aktiv. Griff am Ende ziehen oder antippen führt fort. Maße als technische Bemaßung in drei Stufen (👁): Ruhig, Auswahl, Alle; was zur Auswahl gehört, erscheint beim Antippen; optional Gesamtmaße und Winkelmaße.
- **Oberfläche:** Projekt und neues Projekt liegen im Menü hinter den drei Strichen oben links, Rückgängig und Wiederholen schweben daneben. Die App selbst zoomt nicht, Pinch wirkt nur in der 3D-Ansicht.
- **Projekte verwalten:** Das ⋮ neben einem Projekt im Menü benennt um, dupliziert oder löscht.
- **Designrichtlinien:** Stehen in [DESIGN.md](DESIGN.md), Vorbild ist Fusion 360.
- **Aussehen:** Neutrale Grautöne und Fusion-Blau, Linien-Symbole in den Reitern. Mit der Maus hebt sich hervor, was man gleich anklickt, und jeder Knopf zeigt das Antippen.
- **Projektmanager:** Das Baum-Symbol oben links öffnet die Liste von Projekt, Rohren, Punkten, Schenkeln, Parallelrohren und Ebenen. Antippen wählt aus, das Auge blendet aus. Ausgeblendetes zählt beim Biegen weiter. Das ⋯ einer Zeile benennt um, löscht, dupliziert ein Projekt oder macht ein Parallelrohr zum eigenen Rohr.
- **Navigationsleiste:** Unten in der Mitte wie in Fusion: Verschieben und Zoomen schalten um, sodass ein Finger überall navigiert und Griffe ruhen; gedreht wird auf der freien Fläche oder am Würfel; nochmal antippen oder Esc beendet das. Dazu Einpassen, Anzeige und „+“.
- **Ansichtswürfel:** Oben rechts wie in Fusion 360: Flächen, Kanten und Ecken antippen, Würfel ziehen zum Drehen. Zoom und Lage bleiben dabei stehen, gedreht wird um die Auswahl. Das Häuschen führt zur Startansicht und passt neu ein, in Flächenansichten führen Dreiecke zur Nachbarfläche, oben und unten drehen Pfeile um 90°.
- **Maßstab:** Rohre sind maßstäblich gezeichnet, nur unter 2 Pixeln Dicke bleiben sie 2 Pixel dick. Nach Änderungen zoomt die Ansicht heraus, sobald das Rohr nicht mehr passt, und hinein erst, wenn es nur noch zwei Drittel des Platzes braucht.
- **Ebenen sperren:** Im Projektmanager das Schloss in der Ebenenzeile antippen. Die Ebene ist im 3D-Raum dann nicht mehr anwählbar und bleibt stehen; ihre Werte stehen nur noch zum Lesen in der Leiste. Löschen geht weiter über ⋮, Fangen an ihr auch.
- **Beschriftungen:** Im Auge lassen sich S1, E1, R1, A und die Bündelzahl ausblenden.
- **Messen:** Lineal in der Navigationsleiste, zwei Punkte antippen. Die Leiste zeigt X, Y und Z von Punkt 1 nach Punkt 2, gemessen von Rohrmitte zu Rohrmitte. Ein weiterer Punkt beginnt eine neue Messung. Ein Tipp auf ein Maß stellt den Abstand ein: Der zuletzt gewählte Punkt bleibt fest (gefüllt, „Festpunkt tauschen“ wechselt ihn), der erste wandert nur auf dieser Achse. Das geht für Fittings, Bestandsstücke, freie Ebenen, Eckpunkte und ungesperrte Rohrenden; Gesperrtes, Parallelrohre und der Ursprung bleiben fest. Bei Referenzebenen zählt nur der senkrechte Abstand, gesperrte Ebenen sind messbar. Der Nullpunkt liefert absolute Koordinaten.
- **Schlösser ausblenden:** Unter Einstellungen → Anzeige legt ein Regler fest, ab welchem Maßstab die Schlösser in 3D verschwinden.
- **Winkel:** Im Auge lassen sich Biegewinkel und Drehwinkel getrennt schalten. Der Drehwinkel zeigt, wie weit ein Schenkel um die ankommende Achse aus der nächsten Achsrichtung gedreht ist, zum Beispiel „30° verdreht“.
- **Leeres Projekt und Ursprung:** Ein neues Projekt startet ohne Rohr. Der Ursprung lässt sich im Auge und im Projektmanager ausblenden.
- **Bestandsrohre:** `+` → „Bestandsrohr“ setzt ein 50 mm langes, graues Stück (Länge in den Einstellungen). Es lässt sich nur verschieben, drehen und sperren und dient als Fangziel. Ein Rohr, das an einem Ende beginnt, übernimmt dessen Richtung.
- **Mehrfachauswahl:** Knopf in der Navigationsleiste oder langes Drücken auf ein Objekt, danach weitere antippen. Langes Drücken auf freier Fläche zieht ein Rechteck. Das Zuletztgewählte ist die Referenz. Gemeinsam verschieben, drehen, sperren, löschen.
- **Ganzes Rohr:** Doppeltipp oder Knopf „Ganzes Rohr“. Griffmitte antippen, dann einen Punkt: Das ist der Drehpunkt für diese Bewegung.
- **Kopieren:** Referenzpunkt wählen, dann Ziel antippen oder mit „Orthogonal“ über X, Y, Z setzen. Die Maße der Kopie lassen sich danach noch ändern, ein Tipp in den leeren Raum beendet. „Noch eine“ setzt die nächste Kopie. `+` → „Einfügen“ setzt in anderen Projekten ein.
- **Ausrichten und Verteilen:** Ab zwei Objekten. Ausrichten bringt alles auf X, Y oder Z der Referenz. Verteilen reiht mit Abstand oder gleichmäßig. Orange Bezugspunkte lassen sich durch Tippen wechseln.
- **Einpassen:** Der Knopf passt zuerst die Auswahl ein, der nächste Tipp wieder alles.
- **Verbindungen:** Andocken verbindet Fitting und Rohrende dauerhaft, sie bleiben beim Bearbeiten zusammen. Am Rohrende setzt sich ein Fitting sofort, ein Rohr ab Anschluss ist gleich verbunden. Ein zweiter Tipp aufs Fitting bietet Rohr, Schenkel und Ende zur Wahl. „Lösen“ trennt, „Ganzer Strang“ wählt alles Verbundene. Parallelrohre können noch nicht verbunden werden.
- **Fittings:** CLA-6M und CUA-6M kommen mit der App (`GLB/`) und stehen auf jedem Gerät in der Bibliothek; gelöscht kommen sie nicht wieder. Daten liegen je Gerät, eine Übertragung gibt es nicht. Unter Einstellungen → Fittings lassen sich weitere GLB-Dateien importieren, Anschlüsse werden erkannt (Durchmesser und Tiefe bis Rohranschlag lassen sich anpassen). `+` → „Fitting“: Bezugspunkt wählen. Am Rohrende dockt das Fitting mit dem Anschlag an, „Anschluss“ wechselt den Anschluss. Die Leiste schaltet zwischen Verschieben (Pfeile) und Drehen (Kugel in 15°-Schritten); angedockt dreht ein Ring um das Rohr. Unter Einstellungen → Fittings legt „Drehachse“ je Fitting einen Anschluss oder X, Y, Z fest; dann dreht „Drehen“ nur um diese Achse, die Vorschau zeigt sie gestrichelt. Angedockt bleibt das Rohr die Achse. Beim Verschieben rastet ein Anschluss nahe an einem Rohrende ein, Fittings richten sich nicht aneinander aus, „Andocken“ an einem Rohrpunkt holt ein Fitting heran. Die Stückliste steht unter „Biegen“. Ein neues Rohr kann an einem Anschluss starten und läuft dann aus ihm heraus. Andocken ist einmalig: Verschiebst du danach etwas, wandert das andere nicht mit.
- **Rohrfarbe:** Im Projektmanager auf den Farbpunkt des Rohrs tippen und eine Farbe wählen.
- **Rückgängig:** Ein gemeinsamer Verlauf für alles: Der letzte Befehl wird zurückgenommen, die App wechselt dafür zum betroffenen Rohr oder Projekt. Auch gelöschte Rohre und Projekte kommen so zurück.
- **Navigation:** Drehen und Zoomen laufen um die aktuelle Auswahl (Schenkel, Eckpunkt, Punkt, Ebene, Parallelrohr), ohne Auswahl um die Mitte der Szene. Nach dem Navigieren bleibt die Ansicht stehen; neu eingepasst wird beim Wählen einer Ansicht.
- **Parallelrohre:** `+` → „Parallelrohr“ öffnet den Gimbal am Anfang des gewählten Rohrs, ohne Auswahl zuerst „Rohr wählen“. Das runde Plus am Gimbal setzt mit einem Tipp ein weiteres Rohr im Abstand des ersten. Bei einem Rohr mit Parallelrohren reicht ein Tipp auf seinen Anfang. „Aus Bündel lösen“ und „Bündel auflösen“ machen Parallelrohre zu eigenen Rohren; sie behalten ihre Lage, und Rückgängig nimmt das zurück.
- **Rohrende:** Am Griff mit dem Plus steht die Winkel-Leiste: Die Pfeile kippen auf 15°, 30°, 45°, 60°, 75° oder 90°, der gewählte Winkel bleibt. Ein Pfeil am Rohrende zieht auf seiner Achse in beide Richtungen. Der Griff mit dem Plus folgt dem Zeiger in jede Richtung. Der Bogen wächst beim Ziehen mit dem Schenkel. Unter der halben Mindestlänge entfällt der Schenkel beim Loslassen samt Bogen, darüber gilt die Mindestlänge.
- **Rohr ausrichten:** Startpunkt antippen. Die Kugel aus drei Ringen dreht das Rohr in 15°-Schritten um X, Y und Z. Der Anfang bleibt stehen. Bei festem Ende erscheint sie nur an geraden Rohren.
- **Fangpunkte:** Im Auge einschalten. Ein gezogener Punkt rastet ein, wenn er in der Zugachse (bei schrägen Schenkeln in jeder Achse, in der er sich bewegt; beim Versatz das versetzte Stück in Zugrichtung) auf Höhe eines anderen Eck- oder Endpunkts der Szene (auch der eigenen Parallelrohre, in ihrer Lage beim Griffbeginn) oder auf einer sichtbaren Referenzebene liegt (die Rohrmitte rastet ein, die Ebene wird kräftig umrandet), eine gestrichelte Linie zeigt den Partner.
- **Eckpunkt verschieben:** Eckpunkt antippen, in der Leiste „Verschieben“ wählen. Die Pfeile bewegen nur diesen Punkt: Die zwei Schenkel daran ändern Länge und Winkel, der Rest des Rohrs bleibt stehen.
- **Biegung ändern:** Eckpunkt antippen. Ein Ring dreht den Schenkel um die ankommende Achse, der andere biegt ganz herum, auch in die Gegenrichtung. Bei 90° und offenem Anfang dreht ein dritter Ring den Teil vor dem Eckpunkt um den Schenkel dahinter. Beim Überfahren und Ziehen leuchtet der Teil auf, der sich bewegt. Auf 0° gedreht verschmilzt der Schenkel beim Loslassen mit dem Rohr davor. Reicht die Länge der Schenkel für einen Bogen nicht, bleibt das Rohr beim letzten passenden Stand.
- **Schenkel:** Gelöscht wird nur der letzte Schenkel, über die Leiste. Neue Schenkel entstehen am Rohrende oder als Versatz.
- **Versatzmaße:** Im Auge einschalten. Jeder schräge Schenkel zeigt seinen Versatz am Rohr. Antippen ändert ihn, der Winkel bleibt.
- **Versatz:** Schenkel antippen, das Versatz-Symbol in der Navigationsleiste drücken. Der Versatz beginnt am Punkt und arbeitet in Zugrichtung: Nur der Teil auf der gezogenen Seite wird kürzer. Das Maß steht beim Ziehen am Rohr, der Versatz läuft sofort mit. Unter der kleinstmöglichen Größe ist das Vorschau: Unter der Hälfte entfällt er beim Loslassen, darüber gilt die Mindestgröße. Beim Setzen des Punkts stehen beide Teillängen als antippbare Maße am Rohr. Der Punkt in der Mitte des X legt die Lage fest, jeder Arm steht für Rohrseite und Richtung: Der Rohrteil auf der Seite des Arms wandert in dessen Richtung. Blasse Arme gehen wegen eines Schlosses nicht. Winkel und Ebene stehen in der Leiste, der Winkel lässt sich an der Schräge auch später ändern.
- **Schlösser:** Anfangs- oder Endpunkt antippen, das Schloss in der Leiste schaltet diesen Punkt fest oder lose. Am Punkt zeigt ein Schloss den Status: fest immer, offen nur am gewählten Punkt. Beide fest: Schenkel gleichen aus. Anfang lose, Ende fest: Das Rohr wandert, das Ende bleibt stehen. Ende lose: Das Ende läuft mit.
- **Ruhige Maße:** Beim Zoomen, Drehen und Ziehen behalten Maßzahlen ihren Platz. Erst nach der Bewegung sucht sich eine überdeckte Zahl einmal einen besseren.
- **Rechnen im Maßfeld:** Plus, minus, mal und geteilt, auch mit Klammern, zum Beispiel 300+45*2. Beginnt die Eingabe mit einem Rechenzeichen, gilt sie für das bisherige Maß: +50 oder ×2. Auf dem Handy stehen die Zeichen als Knöpfe am Feld.
- **Maße antippen:** Maßzahlen liegen über Griffen und Pfeilen und weichen ihnen aus. Tippen gilt dem Maß, Ziehen dem Griff darunter.
- **Exakter Abstand:** Ein Parallelrohr beginnt und endet orthogonal versetzt, jeder Schenkel läuft exakt parallel zum Quellrohr. Auf Schenkeln quer zur Versatzrichtung stimmt der Abstand genau. An Ecken im Raum und an zu kurzen Schenkeln gibt der Abstand auf den schrägen Stücken so wenig wie nötig nach, nie unter 60 %. Läuft ein Schenkel selbst in Versatzrichtung, wechselt das Rohr ab dort die Seite.
- **Einklappbare Menüs:** Die Ansichten zeigen nur die aktuelle; Antippen öffnet die Liste, die Wahl oder ein Tipp in die Zeichnung schließt sie. Rohr, Parallelrohr und Ebene liegen im Plus-Menü, die Rohrfarbe hinter dem Farb-Icon oben rechts. Die Legende steht im Anzeige-Menü 👁.
- **Ende fest:** Neue Rohre haben ein loses Ende, das Schloss schließt es. A und Rohrende bleiben stehen. Änderungen gleichen freie Schenkel über ihre Länge aus, zuerst „⇄ Ausgleich“, nie „🔒 Fest“. Ausgeglichene Maße stehen in Klammern.
- **Punkte:** S1/E1, S2/E2 … `+` → „Rohr“: Bezugspunkt antippen (Rohrpunkt, Eckpunkt, Ebene, Ursprung oder frei auf der Arbeitsebene), Versatz über X, Y, Z in der Leiste eingeben, das Maß im Raum antippen oder ziehen, „OK“. Am Startpunkt legt dann Ziehen an einem der sechs Pfeile Richtung und Länge fest. Der Bezugspunkt legt nur die Startlage fest, danach ist das Rohr frei. „Wie zuletzt“ übernimmt den letzten Versatz. Ein Klick daneben entfernt den Startpunkt wieder. Punkt antippen: „Verschieben“ (Pfeile, Koordinaten).
- **Referenzebenen:** „+ Ebene“ (X, Y oder Z), Standard 1000 × 1000 mm, in den Achsfarben stark durchscheinend. Ebene antippen: Pfeile verschieben sie in X, Y und Z, Lage und Größe stehen in der Leiste. Beim Ziehen rasten Griffe an ihr ein.
- **Abschnitt verschieben:** Gerade antippen, Pfeile in der Mitte ziehen. Erst gleichen bestehende Schenkel aus: auf jeder Seite der nächste passende Schenkel wird länger oder kürzer, was dazwischen liegt, wandert mit. Nur wenn es keinen gibt, entsteht ein neuer Schenkel mit zusätzlicher Biegung; bei „Ende frei“ wandert stattdessen das Rohrende mit. Läuft ein Schenkel dabei auf Länge 0, entfällt er samt Bogen.
- **Parallelrohre am Gimbal:** Pfeile legen Rohre an (nach dem ersten nur noch in dessen Richtung, zu nah wird es rot und beim Loslassen verworfen), der Ring dreht das Bündel stufenlos und rastet auf 90°, Punkte und Maße ändern Abstände zum Nachbarn. „Fertig“ schließt den Gimbal. Lagewechsel am Eckpunkt: Ist der Versatz für zwei 90°-Bögen zu klein, nimmt die App für dieses Rohr automatisch 45°, 30° oder 15°. Geht auch das nicht, ist die Lage blass und meldet „Rohrversatz zu gering“. Dasselbe gilt für zu kurze Stücke an normalen Ecken des Bündels.
- **Biegen:** Schritt-für-Schritt-Anleitung je Rohr, Drucken/PDF.
- **Einstellungen:** Rohre (Rohrtypen mit Durchmesser und Zange), Zangen (Radius, Mindest-Gerade), Anzeige, App. Zeile tippen klappt die Werte auf, ⋮ hat Umbenennen und Löschen.
- **Rohrtyp:** Jedes Rohr hat seinen eigenen Typ. Beim Anlegen steht er in der Leiste, ändern geht im Projektmanager über ⋮ → „Rohrtyp“.

## Daten

Projekte, Räume und Zangenprofile werden nur im Browser des jeweiligen Geräts gespeichert (localStorage).

