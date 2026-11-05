# Regelwerk: Rohre legen und bearbeiten im 3D-Raum

Stand: 05.11.2026, umgesetzt bis Version 249 (Schritte A–D). Die Spalten **Heute** nennen nur noch, wo es Besonderheiten gibt. Prüffälle: im Testmodus (`?debug`) in der Konsole `biegeDebug.selfTest()`.

## 1. Grundsatz

> **Was du anfasst, folgt dem Finger. Was gebunden ist, bleibt stehen. Dazwischen gleichen Schenkel aus – nur in der Länge, nie in der Richtung. Geht das nicht, passiert nichts, und die App sagt, warum.**

Daraus folgt:
- Ein Rohr verformt sich nie „von selbst“: Richtungen von Schenkeln ändern sich nur, wenn du genau diese Richtung bearbeitest (Biegewinkel, Drehung, Eckpunkt, Versatz).
- Es gibt keinen Zwischenzustand, der eine Regel verletzt. Beim Ziehen bleibt der Griff an der letzten gültigen Stelle stehen, genau auf der Grenze.
- Jede Ablehnung hat einen Grund in Worten, der Griff wird blass oder das Maß zeigt „· Mindestlänge“.

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Rohr** | Rohranfang S, Schenkel, Bögen, Rohrende E. Die Lage steckt in den Eckpunkten; Bögen ergeben sich aus Winkel und Zange. |
| **Endschenkel** | erster bzw. letzter Schenkel eines Rohrs. |
| **Mittelschenkel** | jeder Schenkel zwischen zwei Bögen. |
| **Fitting** | Bauteil mit Anschlüssen (Achse, Lage, „gerade min.“) und Drehpunkt. |
| **Verbindung** | Rohrende steckt in einem Anschluss. Beide sind ein Knoten. |
| **Strang** | alles, was über Verbindungen zusammenhängt. |
| **Bestandsrohr** | gerades Stück, das schon da ist, meist gesperrt. |

### Bindung eines Rohrendes (von locker nach fest)

| Stufe | Wann | Darf es wandern? |
|---|---|---|
| **frei** | nichts dran | ja, wandert mit |
| **am Endstück** | Fitting hängt nur an diesem Rohr | ja, das Fitting wandert mit (als Ganzes, ohne zu kippen) |
| **gehalten** | Fitting hängt noch an weiteren Rohren oder Bestand | nein – das Rohr gleicht in sich aus |
| **fest** | Schloss am Punkt | nein |
| **gesperrt** | Rohr oder Objekt gesperrt | gar nichts an ihm ändert sich |

## 3. Was immer gilt (Invarianten)

Wird eine davon verletzt, wird die Änderung nicht ausgeführt.

| Nr. | Regel | Heute |
|---|---|---|
| I1 | Ein verbundenes Rohrende liegt genau im Anschlusspunkt. | erfüllt |
| I2 | **Der Endschenkel fluchtet mit der Anschlussachse und zeigt in den Anschluss. Nie schräg.** | erfüllt seit 248: zentrale Prüfung nach jedem Schritt; bestehende schräge Stellen rot markiert, mit Warnung, dürfen nicht schräger werden |
| I3 | Zwischen zwei Bögen bleibt mindestens die Mindest-Gerade der Zange. | erfüllt (Sicherheitsnetz, seit 244) |
| I4 | Hinter einem Anschluss bleibt bis zum Bogen mindestens „gerade min.“ des Anschlusses. | erfüllt beim Ziehen und Bearbeiten |
| I5 | Bögen überschneiden sich nicht. | erfüllt |
| I6 | Gesperrtes und Festes bewegt sich nie. | erfüllt |
| I7 | Fittings drehen sich nur über ihren Ring, nie als Folge einer anderen Bearbeitung. | erfüllt seit 248 für Fittings an mehreren Rohren; ein Endstück (nur ein Rohr) dreht weiter mit seinem Rohr |
| I8 | Was schon gegen I3/I4 verstößt, darf bleiben, aber nicht schlechter werden. | erfüllt |

## 4. Ausgleich: wer passt sich an?

Wenn eine Bearbeitung ein **gebundenes** Ende (gehalten, fest) bewegen würde, gleicht das Rohr selbst aus:

1. Zuerst Schenkel, die du als **„Ausgleich“** markiert hast.
2. Dann die Schenkel **zwischen** der bearbeiteten Stelle und dem gebundenen Ende, **der nächste zuerst** (wird ein Rohrende nachgeführt: vom Ende her, seit 250).
3. Ausgleichen heißt: **nur Länge ändern**, Richtung bleibt. Höchstens drei Schenkel, je Raumrichtung einer.
4. Ein **Endschenkel an einem Anschluss** gleicht nur in seiner eigenen Richtung aus (länger/kürzer), nie quer (sonst I2).
5. „Fest“ markierte Schenkel gleichen nie aus. Kein Schenkel wird kürzer als seine Mindestlänge (I3, I4).
6. Reicht das nicht: **nichts ändern**, Grund nennen („kein Schenkel kann in Richtung oben ausgleichen …“).

Ist das Ende **frei** oder **am Endstück**, wandert stattdessen alles dahinter unverändert mit.

Ist das Ende gebunden, der **Anfang aber frei**, wandert das ganze Rohr so, dass das Ende stehen bleibt (der Anfang folgt). Ausgeglichen wird nur, wenn beide Enden gebunden sind.

Umgesetzt seit 249: „gehalten“ zählt überall wie „fest“ (Schenkellänge, Maße, Schenkel quer, Versatz, Drehen, Messen). Steckt das Rohrende in einem Fitting, gibt es dort keine Fortführ-Pfeile.

## 5. Weitergabe über Fittings (Kette)

Bewegt sich ein Fitting (gezogen oder weil sein Endstück-Rohr wandert), gilt für jedes angeschlossene Rohr:

1. **Längs seines Endschenkels:** nur dieser Schenkel ändert die Länge (seit 246).
2. **Quer dazu:** Das Rohr wandert als Ganzes mit, **wenn sein anderes Ende frei oder am Endstück** ist.
3. Sonst gleicht das Rohr nach Abschnitt 4 aus – mit Schenkeln parallel zur Bewegung. Geht das nicht: Das Fitting bleibt stehen.
4. Ein Rohr wird dabei **nie gekippt** (I2), ein weiteres Fitting **nie gedreht** (I7).
5. Die Kette endet an jedem gehaltenen, festen oder gesperrten Knoten.

Umgesetzt seit 246/248: längs nur der Endschenkel, quer als Ganzes oder Ausgleich im Rohr, nie kippen, nie mitdrehen (außer Endstück); sonst abgelehnt.

## 6. Bearbeitungen im Einzelnen

Abkürzungen: **wandert** = bewegt sich unverändert mit · **gleicht aus** = nach Abschnitt 4 · **Grenze** = wo der Griff stehen bleibt.

### Rohr

| Bearbeitung | Du ziehst | Wandert | Bleibt | Gleicht aus | Grenze |
|---|---|---|---|---|---|
| Rohranfang verschieben | Punkt S | Rohr dahinter, wenn E frei/Endstück | gebundenes E | Schenkel zwischen S und E | Mindestlängen |
| Rohrende ziehen / fortführen | Punkt E bzw. Pfeil | – | alles davor | – | neuer Bogen nur, wenn der bisherige Endschenkel als Mittelschenkel lang genug ist (blasse Pfeile) |
| Schenkellänge | Pfeil am Schenkel | alles dahinter, wenn E frei/Endstück | gebundenes E | Schenkel dahinter | Mindestlänge des Schenkels |
| Schenkel quer verschieben | Pfeil quer | der Schenkel | Rest | Nachbarschenkel je Seite; ohne Nachbarn neuer Bogen | Nachbar auf 0 → rastet ein |
| Eckpunkt verschieben | Eckpunkt | – | alles außer den zwei Nachbarschenkeln | die zwei Nachbarschenkel ändern Richtung | **neu:** nicht an einem Endschenkel, der in einem Anschluss steckt (I2) |
| Biegewinkel | Bogen-Ring | Rohr dahinter dreht | Rohr davor | gebundenes E: abgelehnt | 0° verschmilzt, 180° nicht |
| Abgangsrichtung / Drehung | Ring am Bogen | Rohr dahinter dreht | Rohr davor | gebundenes E: abgelehnt | – |
| Rohr am Anfang drehen | Ring am Anfang | ganzes Rohr | S | – | steckt S im Anschluss: nur um die eigene Achse |
| Versatz | Versatz-X | Teil auf der gezogenen Seite | andere Seite | fester Teil gleicht aus | Mindestgröße der Schräge |
| Maß eintippen | Maßzahl | wie „Schenkellänge“ | wie dort | wie dort | wie dort |
| Messen → Abstand einstellen | Maß | nur das Gemessene, eine Achse | Festpunkt | – | Gesperrtes bleibt |
| Ganzes Rohr verschieben/drehen | Objekt-Griff | Rohr starr | – | angeschlossene Fittings wie Abschnitt 5 | – |

### Fitting

| Bearbeitung | Griff | Was passiert | Grenze |
|---|---|---|---|
| Endstück (ein Rohr) verschieben | X/Y/Z-Pfeile | Rohr wandert als Ganzes, wenn anderes Ende frei; sonst gleicht es aus | – |
| In der Leitung (Verbinder, T mit Abzweig), längs | Pfeilpaar längs der Leitung | ein Rohr länger, eins kürzer; Abzweigrohr wandert seitlich als Ganzes | „gerade min.“, Fangpunkte, ganze mm |
| In der Leitung, quer (seit 250) | Achspfeile quer zur Leitung (bei Leitung auf X/Y/Z einfach alle drei) | Rohre längs der Bewegung: nur Endschenkel; quer: wandern als Ganzes, wenn das andere Ende frei ist, sonst gleicht der nächste passende Schenkel aus | geht es nicht, bleibt das Fitting stehen |
| Winkel / andere Lage | X/Y/Z-Pfeile | nach Abschnitt 5 | nie kippen |
| Drehen in der Leitung | ein Ring um die Leitungsachse | nur das Fitting, freie Abzweigrohre schwenken starr mit | 90°-Raster |
| Drehen am Endstück | Ring um die Rohrachse | Fitting dreht um das Rohr | – |
| Einsetzen in Gerade / statt Bogen | Tipp | Rohr wird getrennt, beide Teile verbunden | „gerade min.“, Winkel muss passen |
| Löschen | Papierkorb | auf Wunsch Rohre wieder zu einem | – |

### Verbinden

| Bearbeitung | Regel |
|---|---|
| Andocken beim Ziehen | Fitting rastet in Lage **und Richtung** auf das Rohrende ein. |
| Anschluss-Knopf „verbinden“ | Hängt das Fitting schon an Rohren: nur, wenn der Endschenkel mit der Achse fluchtet; sonst Hinweis mit Winkel (seit 248). Ein freies Fitting richtet sich beim ersten Verbinden aus. Ebenso beim automatischen Verbinden nach dem Verschieben. |
| Rohr ab Anschluss | Startrichtung = Anschlussachse. |
| Lösen | Verbindung weg, nichts bewegt sich. |

## 7. Wie die App das durchsetzt

Stand 249: Punkte 1–5 sind umgesetzt. Die Prüffälle (Punkt 5) decken ab: Ende frei, Ende gehalten mit freiem und mit festem Anfang, Endstück wandert mit, Fitting längs der Leitung, Kippen im Anschluss abgelehnt, zu kurze Gerade zwischen Bögen zurückgenommen, Verbinder einsetzen und wieder zusammenführen, Winkel statt Bogen.

1. **Eine Prüfung für alle Wege.** Nach jedem Schritt (auch live beim Ziehen) prüft eine Stelle alle Invarianten aus Abschnitt 3 – nicht jede Bearbeitung für sich. Verletzt → zurück auf den letzten gültigen Stand (beim Ziehen: genau auf die Grenze).
2. **Bindung zuerst bestimmen.** Vor jeder Bearbeitung wird für beide Rohrenden die Bindungsstufe (Abschnitt 2) ermittelt. Daraus folgt, ob etwas wandert oder ausgleicht.
3. **Kein Folge-Drehen.** Die Synchronisierung der Verbindungen verschiebt Fittings höchstens, dreht sie aber nie (Drehen nur über den Ring).
4. **Rückmeldung:** Grund in der Leiste oder als Hinweis, blasse Griffe, „· Mindestlänge“, rote Markierung bei bestehenden Verstößen.
5. **Testfälle:** Jede Zeile aus Abschnitt 6 wird ein fester Prüffall (im Testmodus), damit spätere Änderungen nichts unbemerkt kaputt machen.

## 8. Befund „Rohr 9“ (dein aktuelles Projekt)

„Rohr 9“ verbindet den Abzweig des oberen T-Stücks mit dem Abzweig des unteren T-Stücks.

- Oben zeigt der Anschluss in Richtung (0,97 · 0 · −0,26) – das T-Stück wurde am Ring um 15° gedreht. Der erste Schenkel von Rohr 9 läuft aber in Richtung (53 · 116 · −14): **schräg im Anschluss**.
- Unten zeigt der Anschluss senkrecht nach oben, der letzte Schenkel kommt aber von (0 · −116 · −56): **ebenfalls schräg**.

Wie es dazu kam: Ein Rohr, das an **beiden** Enden in Fittings steckt, darf heute beim Nachführen seine Endschenkel kippen (Abschnitt 5, Heute), und beim Verbinden über den Anschluss-Knopf wird die Richtung nicht geprüft (Abschnitt 6, Verbinden). Beides verletzt I2.

Für bestehende Projekte: Die App markiert solche Stellen (wie die zu kurze Gerade) und lässt sie nicht schlechter werden; gerade richten musst du sie selbst (Ende lösen, neu verlegen, wieder verbinden).
