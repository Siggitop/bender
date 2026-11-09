# Roadmap: Gebäude-Experiment

Stand: 08.11.2026. **Phase 0 bis 6 und IFC-Export aus Phase 8 umgesetzt, Stand Version 275**, siehe Abschnitt 6 bis 28. Phase 7 (Verbindung zum Rohrteil) ist zurückgestellt und wieder ausgebaut: Das Gebäude wird vorerst als eigenständiges Werkzeug entwickelt. Ziel: Gebäudestruktur (Tragwerk, Wände, Decken, Öffnungen, Dächer, Ausbau) im Rohrbiege-Assistenten erfassen, zunächst als versteckte Experiment-Option. Später geht der Rohrteil im Gebäude auf, das Gebäude ist der Rahmen für die HLK-Infrastruktur.

## 1. Leitlinien

1. **Versteckt und getrennt.** Ohne Experiment-Schalter ändert sich nichts: kein Menüeintrag, kein Code geladen, keine Daten angefasst. Der Schalter „Experimente“ erscheint in den Einstellungen erst, wenn man die App mit `?exp` öffnet.
2. **Eigener Datenspeicher.** Das Gebäude liegt in IndexedDB, nicht in `biege.v1`. Ein Fehler im Experiment kann die Rohrprojekte nicht beschädigen. Verknüpft wird nur über IDs („Szene X liegt in Geschoss 2“). localStorage (rund 5 MB) reicht für Geschosse und Planunterlagen nicht.
3. **Eigenes Modul.** Neue Datei (zum Beispiel `building.js`), nachgeladen nur bei eingeschaltetem Experiment, wie heute der Bauteil-Editor. Gemeinsam mit dem Rohrteil: Ansicht, Gizmo, Maße, Fangpunkte, Rückgängig.
4. **Datenmodell vor Darstellung.** Reines JSON: Gebäude → Geschoss → Bauteile, jedes mit stabiler ID, Typ und Parametern. Einheit mm, Z nach oben, wie im Rohrteil.
5. **IFC-nah.** Typen angelehnt an IFC (Storey, Column, Beam, Wall, Slab, Covering, Roof, Door, Window, Opening, Space), damit ein späterer IFC-Export eine Übersetzung ist und kein Umbau.
6. **Bedienung wie im Rohrteil:** Fusion 360 als Vorbild, Regeln aus DESIGN.md und KONZEPT.md (Referenz, Sperren, Gimbal, Maße im Bild). Zeichnen realistisch am Mac oder iPad, auf dem iPhone vor allem ansehen und messen.

## 2. Vier Bauteil-Arten statt vieler Einzelfälle

Fast jedes Bauteil ist eine von vier Grundformen. Sind diese sauber gebaut, ist ein neues Bauteil nur noch Parameter und Darstellung.

| Art | Wird gezeichnet als | Bauteile |
|---|---|---|
| **Punktbauteil** | Punkt + Profil + Höhe | Stützen (Beton, Stahl), Einzelfundamente |
| **Linienbauteil** | Achse von A nach B + Profil | Wände, Unterzüge, Stahlträger, Attika/Sims, Brüstungen |
| **Flächenbauteil** | Umriss + Dicke + Höhenlage | Geschossdecken, Bodenplatte, Rasterdecken, Flachdach, Dachflächen |
| **Gehostetes Bauteil** | sitzt in einem anderen Bauteil | Fenster, Türen, Durchbrüche in Wand oder Decke |

**Bezüge:** Achsraster und Geschosse mit Höhen. Jedes Bauteil hängt an ihnen, zum Beispiel „Stütze auf Achse B/3, von OK Rohdecke EG bis UK Decke 1. OG“. Ändert sich eine Geschosshöhe, wandert alles mit.

## 3. Phasen

### Phase 0: Fundament
- Experiment-Schalter, IndexedDB-Speicher, Modul `building.js`
- Datenmodell mit IDs, Typen, Parametern, Bezügen
- Darstellung: WebGL-Ansicht für das Gebäude, damit auch viele Bauteile auf dem iPhone flüssig bleiben
- Rückgängig, Speichern, Export/Import als Datei

**Fertig, wenn:** ein leeres Gebäude angelegt, gespeichert, geladen und rückgängig gemacht werden kann, ohne dass die Rohrdaten berührt werden.

### Phase 1: Bezüge und Planunterlage
- **Geschosse:** Name, OK Rohdecke, Geschosshöhe, Fußbodenaufbau, daraus OKFF und UK Decke
- **Achsraster:** Achsen mit Abständen (1, 2, 3 … / A, B, C …), Schnittpunkte als Fangpunkte, auch schräge Achsen
- **Planunterlage:** PDF oder Bild je Geschoss laden, an zwei Punkten mit bekanntem Maß kalibrieren, blass darunterlegen
- **Grundriss-Ansicht** je Geschoss neben der 3D-Ansicht

**Fertig, wenn:** der Architektenplan eingelegt, kalibriert und das Raster darübergelegt ist.

### Phase 2: Rohbau-Grundformen
- **Wände:** Achse, Dicke, Lage zur Achse (innen, Mitte, außen), Höhe von Geschoss zu Geschoss oder frei. Ecken und T-Stöße werden automatisch verschnitten.
- **Stützen:** rund oder rechteckig, fangen auf Rasterpunkte
- **Geschossdecken:** Umriss zeichnen oder aus Wänden übernehmen, Dicke, Aussparungen
- **Bodenplatte** als Sonderfall der Decke
- Ausgangspunkt: das Raum-Werkzeug aus `site.js` (Grundriss → Wände, Boden, Decke)

**Fertig, wenn:** ein Geschoss mit Stützen, Wänden und Decke steht und eine geänderte Geschosshöhe alles mitnimmt.

### Phase 3: Öffnungen
- **Türen:** Breite, Höhe, Anschlag links/rechts, Aufschlagrichtung, Symbol im Grundriss
- **Fenster:** Breite, Höhe, Brüstungshöhe
- **Durchbrüche** in Wand und Decke, rechteckig oder rund (wichtig für Rohre und Kanäle)
- Öffnungen wandern mit ihrem Bauteil, schneiden es aus, Verschieben nur längs der Wand

**Fertig, wenn:** Türen und Fenster in Wände gesetzt, verschoben und bemaßt werden können.

### Phase 4: Tragwerk
- **Unterzüge:** Linienbauteil unter der Decke, Breite × Höhe, Bezug UK Decke
- **Stahlträger und Stahlstützen** mit Profilkatalog (HEA, HEB, IPE, U, Rundrohr, Rechteckrohr), Drehung um die eigene Achse. Vorbild ist der Fitting-Katalog.
- Fangpunkte an Trägerkanten und Flanschen (später für Rohrhalter)

**Fertig, wenn:** eine Stahlbühne aus Stützen und Trägern gebaut werden kann.

### Phase 5: Dächer
- **Flachdach:** Flächenbauteil, optional mit Gefälle. **Attika/Sims** als Linienbauteil auf dem Rand mit Querschnitt (Höhe, Breite, Überstand), Kante einfach wählen.
- **Schräge Dächer:** Jede Umrisskante bekommt eine Neigung oder „Giebel“, daraus entstehen Pult-, Sattel- und Walmdach automatisch. Dazu Traufhöhe und Überstand.
- Rechnerisch die kniffligste Phase, deshalb nach den Grundformen.

**Fertig, wenn:** ein Flachdach mit Attika und ein Satteldach mit Überstand entstehen.

### Phase 6: Ausbau
- **Rasterdecken (abgehängt):** Fläche je Raum, Abhanghöhe, Raster (zum Beispiel 625 × 625), Startpunkt ausrichtbar, einzelne Platten entfernbar für Revisionsöffnungen. Der Raum darüber ist der HLK-Bereich.
- **Räume:** aus Wänden erkannt, mit Name, Nummer, Fläche
- **Schächte und Technikzentralen** als markierte Zonen über mehrere Geschosse

### Phase 7: Verbindung zum Rohrbiege-Assistenten
- Rohr-Szenen werden einem Geschoss oder Raum zugeordnet und erscheinen im Gebäude.
- Wände, Decken und Unterzüge ersetzen die heutigen Ebenen: Abstände, Fangpunkte und Schatten beziehen sich auf echte Bauteile.
- Kreuzt ein Rohr eine Wand oder Decke, gibt es einen Durchbruch-Vorschlag.
- Kollisionsprüfung Rohr gegen Bauteil.

### Phase 8: Austausch und Pläne
- IFC-Export, danach IFC-Import der Gebäudehülle vom Architekten
- Schnitte und Ansichten, Grundriss als PDF

### Später
Treppen, Rampen, Aufzugsschächte, Vorsatzschalen und Trockenbau, Doppelboden, Fundamente im Detail, Geländer, Materialien und Schichtaufbauten. DWG/DXF als Planunterlage (braucht eine fremde Bibliothek).

## 4. Reihenfolge und Aufwand (grob)

| Phase | Umfang | Nutzen allein |
|---|---|---|
| 0 Fundament | mittel | keiner, aber Pflicht |
| 1 Bezüge + Planunterlage | mittel | hoch: Plan einlegen und nachzeichnen |
| 2 Wände, Stützen, Decken | groß | hoch: erstes echtes Gebäude |
| 3 Öffnungen | mittel | mittel |
| 4 Tragwerk / Stahl | mittel | hoch für HLK-Befestigung |
| 5 Dächer | groß | mittel |
| 6 Ausbau / Rasterdecke | mittel | hoch für HLK |
| 7 Verbindung Rohrteil | mittel | sehr hoch |
| 8 IFC / Pläne | groß | je nach Bedarf |

**Empfehlung:** Phase 0 bis 2 als erster Block. Danach Phase 7 vorziehen, also die Rohre ins Gebäude holen, bevor Dächer und IFC kommen. Dort liegt der eigentliche Mehrwert, und man merkt früh, ob das Zusammenspiel trägt.

## 5. Risiken

- **Darstellung:** Die heutige 3D-Ansicht reicht für Rohre in einem Raum. Ein ganzes Gebäude braucht wahrscheinlich WebGL. Das ist der größte Einzelbrocken und betrifft später auch den Rohrteil.
- **Größe von `app.js`:** Schon rund 8000 Zeilen. Das Gebäude kommt deshalb in ein eigenes Modul, gemeinsame Teile werden bei Bedarf herausgelöst.
- **Bedienung auf dem iPhone:** Gebäude zeichnen ist dort mühsam. Schwerpunkt Mac und iPad, iPhone zum Ansehen, Messen und für den Rohrteil.
- **Speicher:** Planunterlagen (PDF, Bilder) sind groß. Ohne IndexedDB und Export als Datei ist Datenverlust durch Safari möglich.

## 6. Umgesetzt (Version 253)

**Einschalten:** App mit `?exp` in der Adresse öffnen → Einstellungen → Experimente → „Gebäude“. Danach erscheint der Tab „Gebäude“ (auch ohne `?exp`). Ausschalten blendet ihn wieder aus, die Daten bleiben.

**Technik:** `building.js`, nachgeladen erst beim Öffnen. Speicher in IndexedDB `biege-bau` (Gebäude unter `buildings/main`, Unterlagen als Bilddateien unter `files`). Eigene Kamera und eigenes WebGL nach dem Muster des Bauteil-Editors. Rückgängig/Wiederholen über Schnappschüsse.

**Phase 0:** Experiment-Schalter, eigener Speicher, Sichern als JSON-Datei und Laden (ohne Unterlagen), 3D und Grundriss (Grundriss: Wände und Stützen dunkel, Decken hell).

**Phase 1:**
- Geschosse mit Name, OK Rohdecke, Höhe; „+ darüber“ / „+ darunter“ mit Namensvorschlag (EG → 1. OG, UG …); Löschen mit Rückfrage. In 3D sind die Geschosse über dem aktuellen ausgeblendet (Schalter „Geschosse darüber“).
- Achsraster: „Raster erzeugen“ (Anzahl und Abstand in beiden Richtungen, 1, 2, 3 … und A, B, C …) oder einzelne Achse mit zwei Punkten. Achsschnittpunkte und Achsen sind Fangpunkte. Name und Enden änderbar.
- Planunterlage je Geschoss: Bild oder PDF (Seite 1, pdf.js wird dafür einmalig aus dem Netz geladen). Kalibrieren (zwei Punkte, echter Abstand), Verschieben (Punkt auf dem Plan → Zielpunkt mit Fangen), Drehung, Deckkraft.

**Phase 2:**
- Wände: Kette von Punkten, Startpunkt schließt den Umriss. Dicke, Lage zur Achse (links, Mitte, rechts in Zeichenrichtung), Länge per Feld und Richtungspfeil (→ ↑ ← ↓). Höhe leer = bis OK Rohdecke des Geschosses darüber, sonst fest; Fuß-Versatz. L-Ecken auf Gehrung.
- Stützen: eckig (B × T, Drehung) oder rund (Ø), auf Achsschnittpunkte fangend.
- Decken: Umriss tippen oder „Aus Wänden“ (geschlossener Wandumriss, Außenkante der Wände). Oberkante = OK Rohdecke des Geschosses, Dicke nach unten.
- Auswählen, Werte im Feld ändern, Löschen. Ziehen an Anfassern: Wandenden (verbundene Wände laufen mit), Wand verschieben, Stütze verschieben, Deckenecken, Achsenden.
- Fangen: Wandenden und -mitten, Wandenden des Geschosses darunter, Stützen, Deckenecken, Achsschnittpunkte, Achsen; sonst 15°-Winkel und 10-mm-Raster.

**Bekannte Lücken:** siehe Abschnitt 7.

## 7. Nachgezogen (Version 254)

**Lücken aus Phase 2:**
- T-Stöße: Endet eine Wand auf der Achse einer anderen, endet sie an deren Fläche (keine Überlappung mehr).
- Höhe eines Geschosses ändern schiebt alle Geschosse darüber mit.
- „Sichern“ nimmt Planunterlagen (als Bilddaten) und die Zuordnungen der Rohrprojekte mit, „Laden“ stellt sie wieder her.
- Die Planunterlage erscheint nur im Grundriss und beim Kalibrieren oder Verschieben; in 3D verdeckte sie das Modell.
- „Geschosse darüber zeigen“ steht jetzt in der Liste, die Werkzeugleiste hat Platz für „Öffnung“.

**Phase 3, Öffnungen** (Werkzeug Tür-Symbol, Art in der Leiste: Tür, Fenster, Durchbruch, Decke):
- Tür, Fenster, Wanddurchbruch: auf eine Wand tippen, sitzt dort über die ganze Wanddicke, Breite und Höhe, Fenster mit Brüstung, Durchbruch mit Unterkante. Vorgaben: Tür 1010 × 2135, Fenster 1260 × 1385 / Brüstung 900, Durchbruch 300 × 300 / UK 2300.
- Die Wand wird an der Öffnung ausgespart (Brüstung und Sturz bleiben). Öffnungen wandern mit der Wand, verschieben nur entlang der Wand (Quadrat ziehen oder „ab Wandanfang“), bleiben bei kürzerer Wand in der Wand und verschwinden mit ihr.
- Tür: Anschlag links/rechts, Aufschlag auf diese oder die andere Seite; im Grundriss mit Türblatt und Aufschlagbogen. Fenster im Grundriss als Rahmen mit Mittellinie.
- Deckendurchbruch: auf eine Decke tippen, rechteckig B × T, die Decke bekommt ein echtes Loch.
- Gewählte Öffnung: Maß vom Wandanfang und Breite im Bild.

**Phase 7, erster Teil** (in Version 255 wieder entfernt, siehe Abschnitt 8):
- Im Gebäude unter „Rohrprojekte“ eine Szene der Rohrplanung einem Geschoss zuordnen, Lage per X/Y/Z (Z ab OK Rohdecke). Ihre Rohre erscheinen im Gebäude (nur Anzeige, in der Rohrfarbe; Fittings noch nicht).
- Im Rohrteil im Ebenen-Menü „Aus Gebäude (Experiment)“: übernimmt achsparallele Wandflächen, Flächen eckiger Stützen, den Fußboden (OK Rohdecke) und die Deckenunterseite des Geschosses darüber als Ebenen, nur im Umkreis von 3 m um die Rohre. Erneutes Übernehmen ersetzt die früher übernommenen, eigene Ebenen bleiben; ein Rückgängig-Schritt. Damit gelten Abstände, Fangen und Schatten wie bei eigenen Ebenen.

**Bekannte Lücken:**
- Schräge Wände und gedrehte oder runde Stützen geben keine Ebenen (die Ebenen der Rohrplanung sind achsparallel).
- Fittings und Bestandsrohre erscheinen im Gebäude noch nicht. Rohre aus dem Gebäude heraus bearbeiten geht nicht.
- Kein automatischer Durchbruch-Vorschlag, wo ein Rohr eine Wand kreuzt, keine Kollisionsprüfung (Rest von Phase 7).
- PDF: nur Seite 1, braucht beim ersten Laden Internet; nicht getestet. Bilder getestet.
- Bauteile lassen sich nur im aktuellen Geschoss auswählen. Maße nur an der gewählten Wand oder Öffnung.

## 8. Version 255: eigenständig, Phasen 4 bis 6, IFC

**Entscheidung (08.11.2026):** Das Gebäude bleibt versteckter Tab, wird aber unabhängig vom Rohrteil entwickelt. Die Verbindung aus Phase 7 ist ausgebaut: kein „Aus Gebäude“ im Ebenen-Menü, keine Rohrprojekte im Gebäude. Früher gespeicherte Zuordnungen bleiben unbenutzt in den Daten liegen.

**Fangen beim Zeichnen (korrigiert):**
- Ortho: Liegt die Richtung ab dem letzten Punkt nahe am 15°-Raster, bleibt sie dort, auch wenn eine Achse oder Wand in der Nähe ist. Dann fängt der Schnittpunkt des Ortho-Strahls mit der Linie („Achse 2 · Ortho“, „Wandfläche · Ortho“).
- Punktfang (Enden, Ecken, Achsschnitte) gilt mit Ortho nur, wenn der Punkt auf dem Strahl liegt oder der Zeiger sehr nahe ist.
- Linienfang auf Wänden: Wandachse und beide Wandflächen, auch der Wände, die gerade in der Kette entstanden sind; dazu Trägerachsen und die Kanten von Decken, Dächern, Rasterdecken, Räumen, Schächten. Zwei Linien nahe beieinander: ihr Schnittpunkt.

**Arbeitshilfen:**
- Geschoss kopieren: „Kopie als neues Geschoss oben“ (alle Bauteile mit Öffnungen, ohne Schächte).
- Mehrfachauswahl: Shift-Klick am Mac, „+ Weitere“ auf dem Touchscreen; Tafel mit Anzahl je Bauteilart.
- Verschieben und Kopieren (Basispunkt → Zielpunkt, mit Fangen und Ortho); Kopieren mit Anzahl für Reihen. Öffnungen gehen mit ihrer Wand oder Decke.
- Wand teilen: Öffnungen kommen auf das Stück, in dem sie liegen.

**Phase 4, Tragwerk:**
- Träger (Werkzeug neben Stütze): Unterzug B × H oder Stahl mit Profil, Oberkante (OK) über OK Rohdecke, Vorgabe Geschosshöhe − Deckendicke. Stahl auch „Liegend“ (90° gedreht).
- Stützen auch aus Stahl, Drehung in Grad.
- Profilkatalog: IPE 80–600, HEA/HEB 100–500, UPN 80–300, RO 48,3–219,1 (Rundrohr), QRO 50–200 (Quadratrohr), echte Querschnitte (I, U, hohl).

**Phase 5, Dächer** (Menü „⋯“ → Dach):
- Flach: Platte auf Traufhöhe, Überstand, Attika mit Höhe, Breite und Sims (Überstand nach außen).
- Geneigt: je Umrisskante Traufe mit Neigung oder Giebel; Formen Satteldach, Pultdach, Walmdach per Knopf; Giebel werden auf Wunsch mit einer Scheibe gefüllt. Berechnet als untere Hülle der Dachflächen, exakt für Umrisse ohne einspringende Ecken.
- „Aus Wänden“ übernimmt die Außenkante eines geschlossenen Wandumrisses.

**Phase 6, Ausbau** (Menü „⋯“):
- Rasterdecke: in einen Raum tippen oder Umriss zeichnen; Unterkante, Raster (Vorgabe 625 × 625), „Raster mittig“, einzelne Platten herausnehmen. In 3D durchscheinend, im Grundriss gestrichelt.
- Raum: in einen von Wänden umschlossenen Bereich tippen, die Fläche wird erkannt (Wände als Grenze, Türen schließen nicht auf; auf etwa 1 cm genau). Nummer, Name, Fläche im Grundriss.
- Schacht: Rechteck über zwei Ecken, von seinem Geschoss bis zu einem Geschoss darüber; Decken dazwischen werden ausgespart. Im Grundriss mit Kreuz.
- Im Grundriss: Träger, Dächer, Rasterdecken, Schächte (über der Schnittebene) gestrichelt.

**Phase 8, Teil:**
- IFC exportieren (IFC4): Projekt, Grundstück, Gebäude, Geschosse; Wände, Decken, Dach (IfcSlab ROOF), Stützen, Träger, Rasterdecken (IfcCovering), Räume und Schächte (IfcSpace), Türen, Fenster, Durchbrüche (IfcOpeningElement mit Bezug zur Wand/Decke). Geometrie als Dreiecksnetz (IfcFacetedBrep). Die Datei ist formal geprüft (alle Verweise vorhanden), aber noch nicht in einem IFC-Viewer geöffnet worden.
- Ansicht als Bild (PNG): aktuelle Ansicht mit Beschriftung.

**Offen:**
- IFC-Import, Schnitte, Pläne als PDF mit Maßketten.
- Treppen, Rampen, Aufzugsschächte, Brüstungen und Geländer, Vorsatzschalen.
- Dächer mit einspringenden Ecken (L-Grundriss) exakt; Gauben.
- Phase 7 (Rohre im Gebäude), wenn das Gebäude-Werkzeug steht.

## 9. Version 256: Projektmanager, Messen, Treppen, Praxistest

**Bedienung neu geordnet** (Desktop und iPad zuerst, Telefon geht mit):
- Titel oben = Geschosswahl (antippen) mit „Geschosse bearbeiten …“; Bild auf/ab wechselt das Geschoss.
- Liste links mit zwei Reitern: **Struktur** (Geschoss → Räume → Bauteile im Raum, darunter „Ohne Raum“ nach Art gruppiert; antippen wählt aus, Auge blendet einzeln aus) und **Layer** (je Bauteilart ein/aus, „Alles einblenden“). Ausgeblendetes lässt sich im Bild nicht antippen und fängt nicht. Zustand wird mit dem Gebäude gespeichert.
- Unten in der Liste: Fenster für Geschosse, Raster, Unterlage, Datei. Selten gebrauchte Einstellungen (Rasterdecke, Dachform, Treppe) öffnen ebenfalls ein Fenster statt die Tafel zu überladen. Fenster rechts (breit) bzw. als Blatt von unten (Telefon); „Einpassen“ nutzt den freien Bereich daneben bzw. darüber.
- Tastatur: W Wand, S Stütze, T Träger, D Decke, O Öffnung, M Messen, R Raum, G Achse, V Grundriss/3D, F Einpassen, Esc, Entf, Cmd+Z.

**Rasterdecke einstellbar** (Fenster „Raster einstellen …“): Plattenmaß (625×625, 625×1250, 600×600, 1200×600 oder frei, drehen), Unterkante, **Rasterstart** an einer Raumecke mit Randstreifen X/Y oder „Randstreifen gleich“, Anzeige der vier Randstreifen mit Warnung unter einem Drittel Plattenbreite, Mengen (volle Platten, Zuschnitte, herausgenommen). Im Grundriss: Zuschnitte orange, Rasterstart als orangenes Quadrat zum Ziehen. Räume mit Kern (Insel) werden ausgespart.

**Messen** (Lineal, M): Abstand (mit ΔX/ΔY), Kette (Summe), Fläche (Umriss, m² und Umfang) und Bauteil antippen (Raum, Decke, Rasterdecke, Dach mit Dachfläche, Wand mit Ansichtsfläche abzüglich Öffnungen, Treppe). Messungen werden nicht gespeichert.

**Neue Bauteile und Hilfen:**
- Treppe (Menü „⋯“): gerade oder zweiläufig mit Halbpodest, Breite, Steigungen (Vorgabe Höhe/175), Auftritt, Wenderichtung, Treppenauge; Schrittmaß-Prüfung 590–650 mm. Die Deckenöffnung darüber wird automatisch angelegt und bei jeder Änderung nachgeführt (auch nach Geschosskopien). Im Grundriss mit Lauflinie und Pfeil.
- Bodenplatte: im Deckenwerkzeug „Decke | Bodenplatte“ (IFC BASESLAB). Keller: „+ unten (Keller)“ im Geschossfenster.
- Gelände: Höhe im Geschossfenster, in 3D als durchscheinende Fläche (Keller bleibt sichtbar).
- Wandstärken als Schnellwahl (365, 300, 240, 175, 115, 100).
- Stützen „Auf alle Achsschnitte“.
- Mehrfachauswahl mit gemeinsamen Werten (Wände: Dicke, Höhe, Fuß; Stützen: Höhe; Träger: OK; Decken: Dicke; Öffnungen: Maße).
- Raum: Namensvorschläge, „Rasterdecke hier“.
- Datei: „Neues Gebäude“.

**Praxistest Einfamilienhaus** (KG, EG, DG mit Kniestock 1 m, Satteldach 38°): gefunden und behoben
- Fangergebnisse hatten Rundungsreste (8000,000000000001) → auf 0,1 mm gerundet.
- Vier Kniestockwände einzeln einstellen → gemeinsame Werte in der Mehrfachauswahl.
- Raumecken lagen einige Millimeter neben der Wand und zogen den Fang mit → Ecken werden auf die Schnittpunkte der Wandflächen gesetzt (Wohnen/Essen exakt 22,141 m²).
- „Neues Gebäude“ und Löschen des aktuellen Geschosses ließen die Oberfläche ins Leere zeigen → behoben.

**Praxistest Bürokomplex** (Raster 6 × 4 Achsen à 8,10/7,20 m, 96 Stützen, Kern mit zweiläufiger Treppe und Aufzugsschacht über 4 Geschosse, Unterzüge, Großraum mit Rasterdecke, Flachdach mit Attika): gefunden und behoben
- Großraum um den Kern zählte den Kern mit → Räume und Rasterdecken mit Inseln (809,09 m² = 856,26 − 47,17).
- Treppen bekamen keine Deckenöffnung, wenn das Geschoss darüber später entstand → Öffnungen werden laufend nachgeführt.
- Am Telefon verdeckte das Fenster das Modell → Einpassen in den freien Bereich.

**Noch offen:** Treppengeländer, Brüstungen, Aufzüge als eigenes Bauteil, Dachfenster und Gauben, Schnitte, PDF-Pläne mit Maßketten, IFC-Import; Rasterdecken in schrägen Räumen nur näherungsweise (Randstreifen am umschließenden Rechteck); beim Kopieren eines Geschosses wandern auch Eingangstüren mit.

## 10. Version 257: mehrere Gebäude, Startfenster

- **Gebäude-Knopf** oben links neben der Liste (mit Namen, am Telefon nur Symbol) öffnet das Fenster „Gebäude“: alle gespeicherten Gebäude (antippen öffnet, Stift benennt um, Kopie dupliziert, Papierkorb löscht mit Rückfrage), „+ Neues Gebäude“, darunter Datei: „Sichern als Datei“ (JSON mit Planunterlagen), „Laden aus Datei“ (legt ein weiteres Gebäude an, ersetzt nichts), IFC, Bild. Der Knopf „Datei“ in der Liste entfällt.
- Gespeichert wird automatisch bei jeder Änderung; das Fenster zeigt, wann zuletzt. Beim Öffnen kommt das zuletzt benutzte Gebäude.
- **Startfenster** für neue Gebäude (und beim allerersten Öffnen): Name; Keller ja/nein, Anzahl Obergeschosse, Dachgeschoss ja/nein, Geschosshöhe; Grundlage frei, Achsraster (Anzahl und Abstand) oder Plan laden (danach öffnet das Unterlagen-Fenster); optional Umriss Länge × Breite mit Wandstärke → Außenwände in allen Geschossen, Bodenplatte unten, Decken darüber.
- **Leeres Geschoss** zeigt, wie es losgeht (Wand zeichnen, Plan oder Raster, Decke aus Wänden).
- Einpassen (F) berücksichtigt am Desktop ein offenes Fenster oder die Tafel rechts.

## 11. Version 258: Decken liegen auf, kein Flimmern

- Wände und Stützen ohne eigene Höhe gehen bis zur **Unterkante der Decke darüber** (OK Rohdecke darüber minus Deckendicke an dieser Stelle); ohne Decke darüber bis OK Rohdecke. Vorher liefen sie durch die Decke, gleiche Flächen lagen aufeinander und flimmerten (Z-Fighting). Die Tafel zeigt die tatsächliche Höhe. Wände mit festem Wert bleiben unverändert.
- Stöße, an denen eine durchlaufende Wand geteilt ist, werden wie T-Stöße behandelt (keine überlappenden Wandenden mehr).
- Stützen in Wänden werden in der Anzeige 2 mm höher gezeichnet, damit ihre Oberseite nicht mit der Wandoberseite flimmert; Mengen und IFC bleiben exakt.
- Die Gestaltung des Gebäude-Werkzeugs steckt im Modul selbst (nicht mehr in style.css). Vorher konnte eine neue building.js auf ein noch altes Stylesheet treffen, z. B. lag dann das Gebäude-Symbol über dem Namen.

## 12. Version 259: Objektfang mit Fluchten

- **Fluchten (Spurlinien):** Fährt der Zeiger über einen Punkt (Wandende, Wandecke, Mitte, Stütze, Achsschnitt), wird er erfasst (kleines Kreuz). Von erfassten Punkten, den Punkten der laufenden Kette und dem letzten Punkt laufen waagerechte und senkrechte Fluchten; der Zeiger rastet darauf ein, gestrichelt zum Bezugspunkt, Beschriftung z. B. „Flucht Wandmitte“. Am Touchscreen gelten zusätzlich Punkte nahe dem Finger.
- **Ortho + Flucht/Linie:** Mit Ortho schneidet jede Flucht, Wandfläche, Achse oder Verlängerung den Strahl ab dem letzten Punkt („Flucht Wandmitte · Ortho“). Zwei Fluchten oder Linien nahe beieinander: ihr Schnittpunkt.
- **Lot** vom letzten Punkt auf Wandflächen, Achsen, Kanten. **Verlängerung** von Wänden, Achsen und Kanten über ihre Enden hinaus.
- **Mitte**: Knopf in der Befehlsleiste, dann zwei Punkte; der Punkt dazwischen gilt als getippt.
- **Länge eintippen (Mac):** während des Zeichnens einfach Ziffern, Enter setzt den Punkt in Zeigerrichtung (sonst Richtung der letzten Strecke), Minus = Gegenrichtung. Gilt für Wände, Träger, Umrisse, Achsen, Messen, Verschieben, Kopieren. Touchscreen: Längenfeld mit „↗︎ weiter“ (Richtung der letzten Wand) und Pfeilen.
- **Fang-Fenster** („Fang …“ in der Leiste): Endpunkte, Mitten, Achsen, Wandflächen, Fluchten, Lot, Verlängerungen, Raster 10 mm einzeln an/aus (je Gerät gespeichert). **Shift** gedrückt = ohne Fang.
- Getestet mit Maus-Erfassung: Wand endet exakt unter einer Wandmitte, eingetippte 2500 mm, Schnitt zweier Fluchten, Lot auf Wandfläche, Verlängerung, Shift frei.

## 13. Version 260: Wandverbindungen, Wandzug, Ortho-Modus, neues Erscheinungsbild

- **Wände verbinden sich automatisch:** Endet eine Wand im Bereich einer anderen oder kurz davor (z. B. Fang auf Wandecke oder Wandfläche), rückt das Ende auf den Schnitt der Achsen. Trifft es dort das Ende der anderen Wand, rückt dieses mit → L-Ecke auf Gehrung; sonst T-Stoß an der Fläche. Gilt beim Zeichnen (auch Länge per Feld/Tastatur) und beim Ziehen von Wandenden. „Ecken verbinden“ in der Wand-Tafel repariert bestehende Ecken im Geschoss. Lösen: Ende wegziehen.
- **Wandzug:** über Enden verbundene Wände (gleicher Wandart) bilden einen Zug. Doppeltippen auf eine Wand oder „Wandzug (n)“ wählt ihn; die Mehrfachauswahl ändert Wandart, Dicke, Höhe, Fuß für alle.
- **Wandart:** Außenwand (365), Innenwand tragend (240), Innenwand (115), Trockenbau (100) mit Vorgabe-Dicke; in Leiste und Tafel wählbar. Der Projektmanager gruppiert Wände nach Art. IFC: Name nach Art, Trockenbau als PARTITIONING. Das Startfenster legt Außenwände an.
- **Ortho-Modus:** „Ortho“ in der Befehlsleiste oder F8 – nur waagerecht/senkrecht ab dem letzten Punkt, auch beim Ziehen von Enden. Aus: Richtung rastet nur nahe 15°-Schritten.
- **Erscheinungsbild:** Tafel und Fenster mit Formular in zwei gleich breiten Spalten, Beschriftung über dem Feld, Einheit im Feld, große runde Felder mit Fokusring, Segmente als Pille mit gleich breiten Feldern, Aktionen als farbige Pillen (Löschen rot), Hinweise als Karte, farbiges Symbol je Bauteilart im Titel. Befehlsleiste kompakter, mit Ortho/Mitte/Fang als Pillen.
- Getestet: Fang auf Wandecke (9000 | 6120) → Wand rückt auf Achsschnitt (9000 | 6000), Gehrung; T-Stoß an Wandfläche; Doppeltippen wählt 4 Außenwände, Dicke 300 für alle; Ortho zwingt schrägen Zug waagerecht.

## 14. Version 261: Fenster gestalten

- Fenster-Tafel → **„Fenster gestalten …“**: Gesamtmaß (Breite, Höhe, Brüstung), **Felder nebeneinander** (1–6, Breite je Feld fest oder leer = Rest gleich verteilt), **Oberlicht** und **Unterlicht** (aus, durchgehend oder wie die Felder geteilt, mit Höhe), **Rahmen** und **Pfosten**.
- Zeichnung des Fensters mit Öffnungszeichen nach DIN (Spitze zur Bandseite, Kipp = Spitze unten) und Maßen; **Feld antippen** → Öffnungsart: Fest, Drehkipp links/rechts, Dreh links/rechts, Kipp, Schiebe.
- **Vorlagen:** 1-flügelig, 2-flügelig, 3-teilig, mit Oberlicht, Fenstertür, Fenstertür + Seitenteil, Hebeschiebetür; eigene Vorlagen speichern (★) und auf andere Fenster anwenden; Teilung „auf gleich große Fenster“ übertragen.
- Ohne eigene Einstellung bekommt ein Fenster eine Vorgabe nach Breite (bis 1,30 m 1-flügelig, bis 2,50 m 2-flügelig, darüber 3-teilig).
- **3D:** Rahmen, Pfosten, Kämpfer, Glas durchscheinend, Öffnungszeichen auf beiden Seiten. **Grundriss:** Pfostenteilung im Fensterband. **Messen/Tafel:** „3-teilig mit Oberlicht · DK | F | DK“.
- **IFC:** IfcWindow mit Rahmen- und Glasgeometrie, PartitioningType nach IFC (z. B. TRIPLE_PANEL_VERTICAL, sonst USERDEFINED) und Eigenschaftssatz „Fenster“ (Teilung, Öffnungsart je Feld).
- Noch offen: dasselbe für Türen (Seitenteil, Oberlicht, 2-flügelig mit Gang- und Standflügel), Fensterliste als Tabelle.

## 15. Version 262: Stützen in Wänden, aufgeräumte Befehlsleisten

- **Stützen schneiden Wände:** Eine Stütze, die in einer Wand steht, spart die Wand aus (3D, Grundriss, IFC-Geometrie). Die Wand bleibt ein Bauteil. Ist die Stütze schmaler als die Wand, bleibt der Rest der Wand neben der Stütze stehen. Die Ansichtsfläche der Wand zieht durchgehende Stützen ab.
- **Stütze in die Wand setzen:** Tippen in eine Wand übernimmt die Wandrichtung (Drehung) und setzt die Stütze quer **bündig links, mittig oder bündig rechts** (Knopf „In der Wand“, links/rechts in Zeichenrichtung der Wand).
- **Auswahlknöpfe statt Knopfreihen:** Alle Befehlsleisten zeigen Einstellungen als Knopf „Bezeichnung: Wert ▾“. Antippen öffnet eine Liste über dem Knopf, der gewählte Wert hat einen Haken; wo sinnvoll mit Feld für einen eigenen Wert (z. B. „Andere Dicke“). Wand: Typ, Dicke, Lage. Stütze: Art, Maß/Profil, In der Wand. Träger: Art, Maß/Profil. Decke/Dach: Art, Dicke. Öffnung: Art, Größe (gängige Maße + Breite/Höhe). Treppe: Form, Breite, Wende. Rasterdecke: Fläche, Platten. Messen: Art. In der Wand-Tafel ist der Wandtyp ebenfalls ein Auswahlknopf.
- **Fang-Menü neu:** „Fang 7/8 ▾“ öffnet eine Liste mit Schaltern (an = blau) und kurzer Erklärung je Fangart; die Liste bleibt beim Umschalten offen. Der alte Fang-Dialog ist entfernt.
- Getestet: Stütze 240 × 240 bündig links in senkrechte Wand 300 → Drehung 90°, 30 mm aus der Achse; bündig rechts in waagerechte Wand → 30 mm nach unten; IFC ohne fehlende Bezüge; Rohr-Selbsttest 9/9; Handygröße: Liste und Felder passen.

## 16. Version 263: Achsraster auf dem Plan zeichnen

- **Befehl Achse (G):** erste Achse mit zwei Punkten, danach parallele Achsen: **Abstand eintippen** und Enter (Feld „Abstand“ oder direkt auf der Tastatur), auch als Liste „6000 6000 7500“ oder Serie „3x7500“; oder **Lage tippen** (Abstand zur letzten Achse, auf 5 mm gerundet, Vorschau gestrichelt mit Maß). „Seite →/←“ bzw. Minus wechselt die Seite, „Neue Richtung“ beginnt die nächste Schar.
- **Namen:** fortlaufend je Schar (1, 2, 3 … senkrecht, A, B, C … waagerecht); eine Achse zwischen 2 und 3 heißt „2a“. „Neu nummerieren“ zählt alles neu (von links bzw. unten).
- **Maßketten:** je Schar am Achsanfang Abstände von Achse zu Achse und Gesamtmaß (im Grundriss, beim Befehl Achse und bei gewählter Achse). **Maßzahl antippen** → Feld: neuer Abstand, „Folgende mitschieben“ oder nur die eine Achse verschieben. Zu enge Maße stehen versetzt.
- **Achse wählen:** Enden ziehen (Länge), Quadrat in der Mitte verschiebt parallel. **Achskopf antippen** → Name gleich bearbeiten. Tafel: Name, Achskopf (beide Enden, nur Anfang, nur Ende, keiner), Abstand zur Nachbarachse links/rechts, „Parallele Achse anfügen“, „Neu nummerieren“, Löschen.
- **Raster erzeugen** (Schnellstart ohne Plan): Abstände als Liste je Richtung statt Anzahl × gleicher Abstand, mit Vorschau „4 Achsen senkrecht, 3 waagerecht · 19.500 × 12.000 mm“.
- **Kalibrieren:** Ortho (Knopf oder F8) – zweiter Punkt waagerecht oder senkrecht zum ersten, Maß läuft mit. **Plan ausrichten** (in der Kalibrier-Leiste und unter Unterlage): zwei Punkte auf einer Linie, die gerade liegen soll – der Plan dreht sich um den ersten Punkt auf den nächsten rechten Winkel.
- Getestet: Achse 1 + „3x6000 7500“ + Tippen bei 33 m → Achsen 1–6; Querrichtung „6000 8000“ → A–C; Achse bei 9 m → „2a“; Maß 1–2 auf 5000 mit Mitschieben → alle folgenden −1000; Abstand 2a–3 auf 2000 nur eine Achse; Neu nummerieren; Kopf antippen fokussiert den Namen; Plan ausrichten bei 5° Schräge → Drehung −5°; Kalibrieren mit Ortho → zweiter Punkt (10000 | 0); Rohr-Selbsttest 9/9.
- Noch offen: Stützen und Wände folgen beim Verschieben einer Achse nicht automatisch mit; Achsen gelten für alle Geschosse.

## 17. Version 264: Achsen stufenlos verschieben

- Das Quadrat in der Mitte einer gewählten Achse verschiebt jetzt **stufenlos** (1 mm) statt am Objektfang zu springen. Nur ganz nahe an Wand-, Decken- oder Stützenecken rastet es ein („Ecke“); Shift (Mac) schaltet das ab.
- **Beim Verschieben** (Auswahlknopf in der Achs-Tafel): **Nur diese Achse**, **Alle folgenden** (Abstände dahinter bleiben gleich) oder **Ganze Richtung** (alle Achsen der Richtung wandern mit, alle Abstände bleiben gleich). Gilt fürs Ziehen und für geänderte Abstände; bei Abständen wirkt „Ganze Richtung“ wie „Alle folgenden“.
- Gewählte Achse: Abstände zu beiden Nachbarachsen stehen blau direkt an der Achse und laufen beim Ziehen mit.
- Getestet (Ziehen mit Zeiger-Ereignissen): Achse 3 um 437 mm nur allein; um 1234 mm mit allen folgenden (Abstände 3–7 unverändert); um −2777 mm ganze Richtung (alle Abstände unverändert).

## 18. Version 265: Getrennte Maßketten je Achsgruppe

- Achsen gleicher Richtung, die sich der Länge nach nicht überlappen (z. B. links und rechts im Plan), bilden je eine **Gruppe** mit eigener Maßkette (Einzelmaße und Gesamtmaß). Eine Achse, die über mehrere Gruppen durchläuft, gehört zu jeder davon.
- Achs-Tafel: **Maßkette** Links/Rechts (bzw. Unten/Oben, bei schrägen Achsen Anfang/Ende), Beide Seiten oder Aus – gilt für die Gruppe der gewählten Achse. Hinweis „Gruppe: n Achsen (A bis …)“.
- Abstände, Nachbarmaße, Mitnahme beim Ziehen („Ganze Gruppe“ statt „Ganze Richtung“) und Namen arbeiten je Gruppe: eine neue Gruppe zählt eigenständig weiter (H, I, J …), gleiche Lage in einer anderen Gruppe ist erlaubt.
- Getestet: links D–G (−5 bis 12 m), rechts Da–Fa (22 bis 40 m), A–C durchlaufend → zwei Ketten; rechte Kette auf „Rechts“; neue Gruppe bei 50–60 m → H, I, J; Abstand Da–Ea auf 4000 → nur die rechte Gruppe wandert; Rohr-Selbsttest 9/9.

## 19. Version 266: Fang an Stützen

- Stützen fangen nicht mehr nur in der Mitte: **Stützenecke** (Außenkontur, mit Drehung; Stahl: Profilumriss), **Stützenkante Mitte** (bei „Mitten“), **Stützenfläche** als Fanglinie (bei „Flächen“) – damit auch Lot, Fluchten und Verlängerungen an Stützenflächen. Runde Stützen: vier Randpunkte und ein umschreibendes Quadrat als **Stützenflucht**.
- Fang-Erklärungen im Fang-Menü ergänzt.
- Getestet (Stütze 400 × 400): Ecke (70200 | 5200), Kantenmitte (70200 | 5000), auf Fläche (70200 | 5120), Lot von (69000 | 4500) auf die Fläche → (70200 | 4500); rund Ø 400: Randpunkt und Flucht; eine neue Stütze rastete auf der Flucht der Nachbarstütze ein.

## 20. Version 267: Drehpunkt und Einpassen auf Auswahl

- **Drehen um den Punkt unter dem Zeiger:** Beim Drehen in 3D liegt der Drehpunkt auf dem Bauteil, wo man anfasst (Oberseite, Unterseite oder seitlich am Umriss), sonst auf der Geschossebene. Der Drehpunkt bleibt dabei an seiner Stelle im Bild.
- **Drehen um die Auswahl:** Ist etwas gewählt, dreht die Ansicht um die Mitte der Auswahl (hat Vorrang).
- **Drehpunkt sichtbar:** grüner Punkt mit hellem Hof, solange gedreht wird.
- **Einpassen (F / Knopf):** mit Auswahl auf die Auswahl (Blickrichtung bleibt), ohne Auswahl auf alles. **Doppeltippen** auf ein Bauteil (außer Wand, dort Wandzug) wählt es und zoomt darauf, z. B. auf einen Raum.
- Getestet: Drehen an der Oberseite einer Stütze → Punkt bleibt auf 0,00 px stehen; mit Auswahl, angefasst irgendwo → Auswahlmitte bleibt stehen; Einpassen auf Stütze 400 mm → 90 px im freien Bereich; Doppeltippen auf Stütze → Auswahl und 24-fach gezoomt; Rohr-Selbsttest 9/9.
- Noch offen: Isolieren (nur Auswahl zeigen).

## 21. Version 268: Räume zwischen Wänden und Stützen

- Raumerkennung (Raum, Rasterdecke „Ganzer Raum“) zählt Stützen als Begrenzung mit: Wände, die an Stützen enden, schließen den Raum. Raumecken ziehen auch auf Stützenflächen.
- Getestet: vier Stützen 300 × 300, Wände 240 zwischen den Stützenflächen → Raum erkannt (vorher „nicht geschlossen“). Kleine Vorsprünge der Stützen (30 mm) werden vereinfacht; der Umriss kann an einzelnen Seiten bis 30 mm von der Wandfläche abweichen.

## 22. Version 269: Achsverknüpfung, Maße an Öffnungen, 3D-Fang

- **Bauteile folgen den Achsen:** Stützen auf einer Achse, Wand- und Trägerenden auf einer Achse und Stützen in einer Wand, die ganz auf der Achse liegt, wandern mit, wenn die Achse verschoben wird (Ziehen, Maß ändern, Abstand in der Tafel). Öffnungen behalten ihre Lage in der Wand. **Lösen:** in der Achs-Tafel „Bauteile auf der Achse: Bleiben stehen“ (ganze Achse) oder in der Tafel von Wand/Stütze/Träger „Achse …: Von der Achse gelöst“ (einzelnes Bauteil).
- **Raumerkennung genauer:** zweiter Durchlauf mit feinem Raster nur um den gefundenen Raum; Stützenvorsprünge (z. B. 30 mm) bleiben im Umriss erhalten.
- **Fenster, Türen, Wanddurchbrüche über Maße ausrichten** (3D und Grundriss, bei gewählter Öffnung): Maße auf der Wandfläche zur Kamera hin – links und rechts bis zur nächsten Kante (Wandfläche, Nachbaröffnung, Stütze in der Wand), Brüstung bzw. Unterkante, bis Unterkante Decke. Maß antippen → neuer Wert → Öffnung verschiebt sich.
- **Deckendurchbrüche:** Maße von jeder Kante in X und Y bis zur nächsten Wandfläche bzw. Deckenkante, antippbar.
- **Fang in 3D:** Ecken oben/unten (Wand, Stütze, Decke, Träger, Schacht, Öffnungen), Kantenmitten oben, Kanten oben/unten/senkrecht und Laibungen; verdeckte Punkte werden nicht gefangen. Beim **Messen** zusätzlich Flächen und **X/Y/Z-Strahlen** (rot/grün/blau) ab dem letzten Punkt; Ergebnis mit ΔZ, Länge eintippen läuft entlang des Strahls.
- Getestet: Achse 2 +500 → Stützen auf 2/A und 2/B und Wandanfang folgen, Wandende auf Achse 3 bleibt; einzelne Stütze gelöst bleibt stehen; Achse „Bleiben stehen“ → nichts folgt. Raum mit Stützen: 11 Ecken exakt. Fenster: links 1000, bis UK Decke 300, Brüstung 850, rechts 500 → Lage stimmt (Summe gleich). Deckendurchbruch links auf 500. 3D: Stützenecke oben/unten, Kantenmitte, Stützenfläche, Z-Strahl 1.500 mm (ΔZ 1.500). IFC ohne fehlende Bezüge, Rohr-Selbsttest 9/9.
- Noch nicht: Decken- und Raumecken folgen Achsen nicht; Flächenfang nur beim Messen.

## 23. Version 270: Phase 0 der UX-Roadmap

Zahlen-Leser für alle Felder (deutsches Format, Einheiten, Rechnen), Felder zeigen nackte Zahlen, Dialoge folgen der Auswahl, Wandkanten verschwinden hinter Stützen, Breite als antippbares Maß, Maßzahlen ohne Überdeckung. Einzelheiten und Prüfungen in [ROADMAP-UX.md](ROADMAP-UX.md), Abschnitt 7.

## 24. Version 271/272: Module und Selbsttest

`building.js` ist in Module aufgeteilt (Math, Steel, Store, Data, CSS) und bekommt einen eigenen Selbsttest (`biegeDebug.bau.selfTest()`, 10 Fälle). Einzelheiten in [ROADMAP-UX.md](ROADMAP-UX.md), Abschnitt 8.

## 25. Version 273: Desktop-Gerüst mit Menüband

Menüband, angedockte Paletten, Optionsleiste und Statusleiste ab 1000 px; Rechtsklick-Menü, Kontext-Reiter, Kürzel-Übersicht. Einzelheiten in [ROADMAP-UX.md](ROADMAP-UX.md), Abschnitt 9.

## 26. Trennung vom Rohrbiege-Assistenten (09.11.2026)

Die Gebäude-App liegt jetzt im Ordner `gebaeude/` und läuft für sich: eigene Startseite (`index.html` mit Start-Skript `app.js`), eigenes Manifest und Symbol, eigener Service Worker (Cache „gebaeude-v…“), eigene Versionsnummer (`version.js`, hier ab 273), eigene Dokumentation (README, DESIGN, diese Roadmap). Aus dem Rohrteil sind Reiter, Schalter „Experimente → Gebäude“, `openBau` und die Einträge im Service Worker entfernt (Rohrbiege-Assistent jetzt Version 274, Selbsttest 9/9).

- **Aufruf:** `…/gebaeude/` (lokal `http://localhost:8765/gebaeude/`), Testmodus `?debug`; `?exp` ist nicht mehr nötig. Auf dem iPad lässt sich die Seite getrennt zum Home-Bildschirm hinzufügen.
- **Daten:** Der Speicher (IndexedDB „biege-bau“) gehört zur Adresse (Ursprung), nicht zum Pfad. Alle bisher angelegten Gebäude sind unter `…/gebaeude/` auf demselben Rechner und Server weiter da (geprüft auf localhost:8767: „Fangtest“ mit 24 Bauteilen).
- **Grundstile:** `style.css` ist eine Kopie der Rohr-App-Grundstile; sie kann später auf das Nötige beschnitten werden. Änderungen am gemeinsamen Aussehen müssen an beiden Stellen gemacht werden.
- Getestet: Rohrteil ohne Gebäude (9/9, keine Konsolenfehler); Gebäude-App allein (10/10, Desktop-Gerüst bei 1500 px, Schließen → Startseite → „Gebäude öffnen“, eigener Service Worker mit Bereich `/gebaeude/`).

## 27. Version 274: Eigenschaften-Palette (Phase 2, erster Stand)

Einklappbare Abschnitte Mengen/Bezug/IFC, Bauteil-Editoren (Fenster, Dach, Treppe, Rasterdecke) angedockt und an die Auswahl gebunden, Geschoss und Planunterlage in der Palette, „verschieden“ bei Mehrfachauswahl. Einzelheiten in [ROADMAP-UX.md](ROADMAP-UX.md), Abschnitt 10.

## 28. Version 275: Bauteiltypen (Phase 3, erster Stand)

Typenkatalog mit 29 Vorgabetypen (Wand mit Schichten, Decke, Stütze, Fenster, Tür), Typauswahl in Palette und Wandbefehl, Typ bearbeiten ändert alle Exemplare, Typen-Reiter im Projektbrowser, Schichten im Grundriss und im IFC. Einzelheiten in [ROADMAP-UX.md](ROADMAP-UX.md), Abschnitt 11.
