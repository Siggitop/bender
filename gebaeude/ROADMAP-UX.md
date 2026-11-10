# Roadmap Nutzererfahrung: Gebäude-Werkzeug auf dem Prüfstand

Stand: 10.11.2026, Version 284 (Phase 0 umgesetzt, Abschnitt 7; Modul-Aufteilung und Selbsttest, Abschnitt 8; Phase 1 erster Stand, Abschnitt 9; Phase 2 erster Stand, Abschnitt 10; Phase 3 erster Stand, Abschnitt 11; Phase 4 erster Stand, Abschnitt 12; Phase 5 erster Stand, Abschnitt 13; Phase 6 abgerundet, Abschnitt 14 und 15; Phase 7 erster Stand, Abschnitt 16; Phase 8 und Gesamtstand, Abschnitt 17). Schwerpunkt ist das Gebäude-Werkzeug (`building.js`), das hauptsächlich am **Desktop** (Mac, großer Bildschirm, Maus, Tastatur) benutzt wird; das iPad bleibt zweite Plattform. Der Rohrbiege-Assistent bleibt vorerst unverändert, der letzte Abschnitt zeigt nur, wie er später in dieselbe Oberfläche passt.

Die Roadmap ist in Phasen geordnet. Jede Phase ist für sich nutzbar, Phase 0 sind Fehler, die vor allem anderen behoben werden.

---

## 1. Befund

### 1.1 Aufbau der Oberfläche heute

| Bereich | Wo | Inhalt |
|---|---|---|
| Kopfzeile | oben links / Mitte / rechts | Projektmanager-Knopf, Gebäude-Knopf (Gebäude öffnen, neu, sichern, IFC), Rückgängig/Wiederholen, Geschoss-Auswahl, Schließen |
| Werkzeugleiste | unten Mitte, schwebend | Auswählen, Wand, Stütze, Träger, Decke, Öffnung, „…“ (Treppe, Dach, Rasterdecke, Raum, Schacht, Achse), Messen, Grundriss/3D, Einpassen |
| Befehlsleiste | unten, über der Werkzeugleiste | Aufforderung, Auswahlknöpfe des Befehls, Ortho/Mitte/Fang, Fertig/Abbrechen |
| Tafel | rechts oben, schwebend | Eigenschaften der Auswahl und Aktionen |
| Projektmanager | links, aufklappbar | Struktur und Layer, darunter Knöpfe Geschosse, Raster, Unterlage |
| Dialoge | schwebende Karten | 9 Stück: Geschosse, Raster erzeugen, Planunterlage, Gebäude, Neues Gebäude, Rasterdecke, Dach, Fenster gestalten, Treppe |
| Kleine Popups | an Knöpfen und Maßen | Auswahllisten, Fang-Schalter, Maß-Editor, Geschoss-Liste |

Rund 70 verschiedene Aktionen verteilen sich auf diese Orte. Für viele gibt es genau einen Weg, und der ist oft nicht dort, wo man ihn sucht: Geschosse stecken im Projektmanager-Fuß, Kalibrieren im Unterlage-Dialog, IFC hinter dem Gebäude-Knopf, Dachdetails in einem Dialog aus der Tafel heraus.

### 1.2 Was gut ist und bleiben soll

- Ein flaches, verständliches Datenmodell (Gebäude → Geschosse → Bauteile mit `storey` und `host`), Speicherung lokal in IndexedDB, IFC-Export.
- Befehle mit Aufforderung, Fang, Fluchten, Ortho, eingetippten Längen – das ist CAD-Arbeitsweise und funktioniert.
- Antippbare Maße (Achsraster, Öffnungen, Durchbrüche) – genau diese Art des Bearbeitens sollte zum Standard für alle Bauteile werden.
- Rückgängig für jede Änderung, automatische Speicherung.

### 1.3 Schwächen im Konzept

1. **Mobile Muster auf dem Desktop.** Schwebende Leisten unten, schwebende Tafel, Karten-Dialoge: das ist für das Telefon gebaut. Am Desktop verdecken sie das Modell, springen in Größe und Lage und bieten zu wenig Platz für Eigenschaften.
2. **Kein fester Ort für Eigenschaften.** Ein Teil steht in der Tafel, ein Teil in Dialogen (Dach, Treppe, Rasterdecke, Fenster), ein Teil in der Befehlsleiste. Wer ein Fenster ändern will, sucht an drei Stellen.
3. **Dialoge sind modal gedacht, aber nicht modal gebaut.** Sie bleiben offen, während man weiterarbeitet, hängen aber an dem Bauteil, für das sie geöffnet wurden (siehe Fehler F2). Entweder richtig an die Auswahl binden oder ganz abschaffen.
4. **Typ und Exemplar sind nicht getrennt.** Jede Wand trägt Dicke und Art selbst, jedes Fenster seine Teilung. Es gibt keine Wandtypen mit Schichten, keine Fenstertypen, keine Stützentypen. Ändern „aller 36,5er-Außenwände“ geht nur über Mehrfachauswahl.
5. **Beziehungen sind nur geometrisch.** Ob eine Stütze an einer Achse hängt, ob zwei Wände verbunden sind, ob ein Raum an Wänden hängt, wird jedes Mal aus Koordinaten abgeleitet (1 mm Toleranz). Das ist robust für einfache Fälle, aber unsichtbar und nicht steuerbar (Ausnahme: „Von der Achse gelöst“).
6. **Zwei Bedienmuster für dasselbe.** Segmentknöpfe und Auswahlknöpfe stehen nebeneinander; manche Werte sind Felder in der Leiste, andere in Listen. Achsen haben antippbare Maße, Wände und Stützen nicht.
7. **Eine Datei, 3.500 Zeilen.** Oberfläche, Geometrie, Fang, IFC und Speicher in einem Modul. Jede Änderung trifft alles, Fehler wie F2 entstehen an den Nahtstellen.

### 1.4 Datenmodell im Detail

| Thema | Heute | Problem | Ziel |
|---|---|---|---|
| Version | keine Schemaversion | alte Gebäude werden still „repariert“ (`fixB`), Felder kommen dazu ohne Plan | `B.schema` und eine Kette von Migrationen |
| Bauteiltypen | Werte am Exemplar (`t`, `kind`, `prof`, Fenster-`cfg`) | keine Typen, keine Schichten | Katalog `B.types` (Wand-, Decken-, Stützen-, Fenster-, Türtypen), Exemplar verweist mit `type` und überschreibt nur Abweichungen |
| Höhen | teils absolut (`ceil.z`), teils relativ (`sill`, `base`), teils automatisch (`h: null` = bis Decke) | schwer zu erklären | jede Höhe als Bezug + Versatz: „UK Decke darüber −0“, „OK Rohdecke +900“ |
| Beziehungen | aus Geometrie abgeleitet | unsichtbar, Toleranz 1 mm | gespeicherte Verknüpfungen: `joins` (Wand–Wand, Wand–Stütze), `grid` (Achsbindung), `host`; Ableitung nur beim Anlegen |
| Öffnungen | `at` = Mitte ab Wandanfang | dreht sich mit, wenn die Wand umgedreht wird; Bezug nicht wählbar | Bezug wählbar (Wandanfang, Wandende, Achse, nächste Kante) und gespeichert |
| Räume | Umriss als Punkte, einmal erkannt | wandern nicht mit, wenn Wände sich ändern | Raum = Startpunkt + Begrenzungen, Umriss wird neu berechnet (wie Revit) |
| Achsen | Linien mit Namen, Gruppen abgeleitet | Gruppen-Seite der Maßkette steckt an den Achsen | `B.gridSets` mit Seite, Nummerierung, Sichtbarkeit |
| Rückgängig | ganzes Gebäude als Text je Schritt | großes Gebäude = viel Speicher, kein Name für den Schritt | Änderungslisten mit Namen („Fenster verschoben“), im Menü sichtbar |
| Geometrie | bei jedem Zeichnen neu (Wandstücke, Ecken, Fang) | große Modelle werden langsam | Zwischenspeicher je Bauteil, ungültig bei Änderung |

### 1.5 Parametrische Objekte

| Objekt | Parameter heute | fehlt für gute Bedienung |
|---|---|---|
| Wand | Art, Dicke, Lage zur Achse, Höhe/Fuß, Ecken automatisch | Wandtyp mit Schichten; Anschluss an Stützen (stumpf, nicht Gehrung); Kopf- und Fußbezug; antippbare Länge und Abstände; Ecke von Hand: Gehrung / stumpf / durchlaufend |
| Stütze | Form, Maß/Profil, Drehung, Höhe | Typ; Bezug Achse/Wand sichtbar; Abstände zu Achsen als Maße; Drehung per Griff |
| Träger | Art, Maß/Profil, OK | Auflager an Stützen/Wänden; Länge folgt den Auflagern |
| Decke | Umriss, Dicke, Bodenplatte | Bezug an Wände (Rand folgt), Aussparungen bearbeiten, Gefälle |
| Dach | Art, Neigung je Kante, Traufe, Attika | eigenes Kontextband statt Dialog; Firstlinie als Griff |
| Treppe | Form, Breite, Stufen, Wende | Steigung/Auftritt als Regel (Schrittmaßregel) mit Warnung; Lauflinie sichtbar |
| Fenster/Tür | Größe, Brüstung, Teilung, Öffnungsarten, Vorlagen | Typen statt Vorlagen; Laibung, Anschlag; Bezug wählbar; Liste aller Fenster |
| Rasterdecke | Plattenmaß, Raster-Start, herausgenommene Platten | Bezug zum Raum fest; Randstreifen-Regel |
| Raum | Name, Nummer, Fläche | Umriss folgt Wänden; Höhe, Volumen, Nutzung |
| Achse | Name, Köpfe, Gruppen, Bindung | Achsgruppen als Objekt; Schräge Achsen mit Winkelmaß |

### 1.6 Fehler und Ungereimtheiten (belegt)

| Nr. | Fehler | Ursache im Code |
|---|---|---|
| F1 | **Zahlen mit Tausenderpunkt werden falsch gelesen.** „1.260“ wird zu 1,26 mm. Schlimmer: Die App schreibt selbst „1.260“ in die Felder; wer dort nur eine Ziffer ändert, bekommt einen Wert um den Faktor 1000 zu klein. | `num()` ersetzt nur das Komma durch einen Punkt und lässt `parseFloat` den Tausenderpunkt als Dezimalpunkt lesen. Nur die Achsabstände (`parseSpacing`) behandeln den Punkt richtig. |
| F2 | **„Fenster gestalten …“ bleibt am ersten Fenster hängen**, wenn man danach ein anderes Fenster wählt. Dasselbe gilt für Dach, Treppe und Rasterdecke. | Der Dialog merkt sich beim Öffnen `dlg.el` und liest nie wieder die Auswahl. |
| F3 | **Stützen an Wandecken:** Die auf Gehrung laufenden Wände bleiben als Linien sichtbar, obwohl die Stütze die Ecke ausfüllt. | Die Körper der Wand werden ausgespart (`wallPieces`), die **Kantenlinien** aber aus dem ungeschnittenen Umriss gezeichnet (`prism(footprint(e), …, lines)`). Zusätzlich bleibt die Gehrung selbst bestehen: Treffen sich zwei Wände an einer Stütze, sollten beide stumpf an der Stützenfläche enden. |
| F4 | Bei einer gewählten Öffnung erscheinen alte orange Maße am Fußboden zusätzlich zu den neuen blauen Maßen. | Altes Grundrissmaß „ab Wandanfang“ wird weiter gezeichnet. |
| F5 | Enge Maßketten: Zahlen berühren Maßstriche, Ketten benachbarter Achsgruppen überlagern sich. | Feste Abstände der Ketten, keine Kollisionsprüfung. |
| F6 | Nach einem Update zeigte der Browser manchmal die alte Version. | **Kein App-Fehler:** Der Service Worker holt zuerst vom Netz und nimmt den Cache nur, wenn der Server nicht erreichbar ist. Es trat auf, wenn der lokale Testserver gestoppt war. |
| F7 | Flächenfang in 3D wirkt nur beim Messen. | bewusst eingeschränkt, weil Flächen den Ortho-Fang beim Zeichnen überdecken. |
| F8 | Räume, Decken- und Dachumrisse folgen weder Wänden noch Achsen. | Umrisse sind feste Punkte (siehe 1.4). |

---

## 2. Leitbild

**Ein Ort für jede Art von Handlung:**

- **Befehle** (etwas Neues anlegen oder eine Aktion ausführen) stehen im **Menüband** oben.
- **Eigenschaften** (etwas Gewähltes ändern) stehen in der **Eigenschaften-Palette** rechts. Immer, für jedes Bauteil, ohne Dialog.
- **Struktur** (Geschosse, Bauteile, Layer, Ansichten) steht im **Projektbrowser** links.
- **Zustand** (Fang, Ortho, Koordinaten, Aufforderung, Einheiten) steht in der **Statusleiste** unten.
- **Maße im Modell** sind antippbar und ändern das Bauteil direkt.

Dialoge gibt es nur noch für zwei Dinge, die wirklich einen eigenen Arbeitsbereich brauchen: den **Fenster-/Tür-Editor** und **Neues Gebäude**. Beide hängen an der Auswahl oder sind modal (siehe Regel R3).

### 2.1 Desktop-Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Gebäude ▾  Start  Tragwerk  Öffnungen  Ausbau  Raster+Plan  Messen  Ansicht   │  Reiter
│ ┌────────────┬────────────┬─────────────┬───────────┬─────────────┐            │
│ │ Wand ▾ Stütze ▾ │ Decke ▾ Dach │ Ändern: Verschieben Kopieren … │ Auswahl  │  Menüband
│ └────────────┴────────────┴─────────────┴───────────┴─────────────┘            │
├─ Optionsleiste: Wand · Typ [Außenwand 36,5 ▾] · Lage [Mittig ▾] · Höhe [bis UK Decke ▾] · Länge [____] ┤
├───────────────┬──────────────────────────────────────────────┬─────────────────┤
│ Projektbrowser │                                              │ Eigenschaften   │
│ ▾ Geschosse    │                                              │ Fenster F-03    │
│   ▸ DG         │                  Modell                      │ Typ: DK 2-flg ▾ │
│   ▾ EG ●       │                                              │ ─ Lage ──────── │
│     Wände (24) │                                              │ Breite   1.260  │
│     Räume (8)  │                                              │ Brüstung   900  │
│ ▸ Achsen       │                                              │ ─ Teilung ───── │
│ ▸ Unterlagen   │                                     [Würfel] │ [Fenster-Editor]│
│ ▸ Ansichten    │                                              │                 │
├───────────────┴──────────────────────────────────────────────┴─────────────────┤
│ Wand: nächsten Punkt tippen · X 12.400 Y 3.250 │ Fang ▾ 7/8 · Ortho · Raster │ EG │  Statusleiste
└──────────────────────────────────────────────────────────────────────────────┘
```

- Paletten links und rechts sind andockbar, einklappbar (Kante anklicken) und in der Breite verstellbar. Breite wird gemerkt.
- Das Modell wird nie von schwebenden Karten verdeckt. Einpassen rechnet mit der freien Fläche.
- Das Menüband lässt sich auf eine Zeile (nur Reiter) einklappen; Doppelklick auf einen Reiter klappt es auf.

### 2.2 Menüband (Ribbon) – warum und wie

Ein Menüband ist hier sinnvoll, weil es rund 70 Aktionen **sichtbar und gruppiert** anbietet, die heute auf Kopfzeile, Werkzeugleiste, „…“-Menü, Projektmanager-Fuß, Tafel und Dialoge verteilt sind. Es ersetzt dabei fünf der neun Dialoge.

**Reiter und Gruppen (Vorschlag):**

| Reiter | Gruppen und Befehle |
|---|---|
| **Gebäude** (Datei-Bereich, ganzseitig) | Neu, Öffnen (Liste mit Vorschau), Umbenennen, Duplizieren, Löschen · Sichern als Datei, Laden aus Datei · IFC exportieren, Bild exportieren · Einstellungen (Einheiten, Fang-Vorgaben) |
| **Start** | Auswählen · Wand ▾, Stütze ▾, Decke ▾ (die drei häufigsten) · Ändern: Verschieben, Kopieren, Spiegeln, Drehen, Teilen, Löschen · Zwischenablage · Rückgängig-Liste |
| **Tragwerk** | Wand ▾ (Typen), Stütze ▾, Träger ▾, Decke, Bodenplatte · Verbinden: Ecken verbinden, Anschluss an Stütze, Wandzug wählen · Auf Achsschnitte setzen |
| **Öffnungen** | Tür ▾, Fenster ▾, Wanddurchbruch, Deckendurchbruch, Schacht · Fenster-Editor · Typen verwalten |
| **Ausbau** | Raum, Raumstempel · Rasterdecke, Rasterstart, Platten herausnehmen · Treppe ▾ · Dach ▾ |
| **Raster + Plan** | Achse, Parallele Achse, Raster erzeugen, Neu nummerieren, Maßketten-Seite · Unterlage laden, Kalibrieren, Ausrichten, Verschieben, Deckkraft · Geschosse (öffnet den Geschoss-Bereich im Projektbrowser) |
| **Messen** | Abstand, Kette, Fläche, Bauteil · Mengen (Liste aller Flächen/Längen) · Prüfen (Schrittmaß Treppe, offene Räume) |
| **Ansicht** | Grundriss, 3D, Würfel-Richtungen · Einpassen, Auf Auswahl · Darüber anzeigen, Gelände · Layer · Darstellung (Linien, Schatten, Durchsicht) · Gespeicherte Ansichten |

**Kontext-Reiter** (erscheinen rechts, farbig, wenn etwas gewählt ist – wie „Ändern | Wände“ in Revit): Wand, Stütze, Fenster/Tür, Decke, Dach, Treppe, Achse, Raum. Sie enthalten nur die Aktionen für die Auswahl (z. B. Wand: Teilen, Umkehren, Wandzug, Ecke verbinden/lösen, Von Achse lösen, Typ ändern). Die Werte selbst stehen in der Eigenschaften-Palette.

**Optionsleiste** direkt unter dem Menüband ersetzt die heutige Befehlsleiste unten: Sie zeigt, solange ein Befehl läuft, dessen Einstellungen (Typ, Lage, Höhe, Länge) mit den bestehenden Auswahlknöpfen. Die Aufforderung wandert in die Statusleiste.

**iPad:** dasselbe Menüband, aber einzeilig mit Symbolen und Text darunter; Paletten als Seitenblätter, die über das Modell gleiten. Telefon wird nicht mehr eigens optimiert.

### 2.3 Was aus den neun Dialogen wird

| Dialog heute | künftig |
|---|---|
| Geschosse | Projektbrowser-Bereich „Geschosse“ (Liste, Höhe direkt editierbar, Rechtsklick: oben/unten einfügen, kopieren, löschen) + Eigenschaften des gewählten Geschosses |
| Raster erzeugen | Reiter Raster+Plan, Befehl „Raster erzeugen“ mit Werten in der Optionsleiste und Live-Vorschau im Modell |
| Planunterlage | Reiter Raster+Plan + Eigenschaften der Unterlage (Deckkraft, Drehung, Maßstab) |
| Gebäude | ganzseitiger Bereich „Gebäude“ (wie „Datei“ in Office) |
| Neues Gebäude | bleibt als Assistent (modal, ein Schritt), Einstieg im Bereich „Gebäude“ |
| Rasterdecke | Eigenschaften-Palette (Plattenmaß, Unterkante, Start) + Kontext-Reiter (Rasterstart, Platten) |
| Dach | Eigenschaften-Palette (Art, Neigung je Kante als Tabelle, Attika) + Griffe im Modell |
| Treppe | Eigenschaften-Palette (Form, Breite, Steigung/Auftritt mit Prüfung) |
| Fenster gestalten | **Fenster-Editor** als andockbarer Bereich, **gebunden an die Auswahl**; bei Mehrfachauswahl gleicher Fenster gilt er für alle |

Ergebnis: von 9 Dialogen auf 1 Assistenten und 1 Editor.

---

## 3. Regeln für jede Eingabe und jede Anzeige

| Nr. | Regel |
|---|---|
| R1 | **Ein Zahlen-Leser für alles.** Deutsches Format: „1.260“, „1260“, „1 260“, „1.260,5“ und „1260,5“ ergeben dasselbe. Ein Punkt gefolgt von genau drei Ziffern ist Tausendertrenner, sonst Dezimalzeichen. Rechenausdrücke erlaubt: „2*1260+115“, „6000/3“. Einheiten im Feld: „1,26 m“, „126 cm“. |
| R2 | **Felder zeigen beim Bearbeiten den nackten Wert** („1260“), beim Anzeigen formatiert („1.260“). Ungültige Eingabe färbt das Feld rot und behält den alten Wert. |
| R3 | **Alles Bearbeitende hängt an der aktuellen Auswahl.** Wechselt die Auswahl, zeigt jeder offene Bereich das neue Bauteil oder schließt sich. Nie ein unsichtbares „altes“ Ziel. |
| R4 | **Enter übernimmt, Esc verwirft, Tab springt weiter**, überall gleich. Fokus springt nach Übernehmen zurück ins Modell. |
| R5 | **Ein Bedienelement je Art von Wert:** Auswahl aus festen Werten → Auswahlknopf; Ein/Aus → Schalter; Maß → Feld mit Einheit; zwei bis drei kurze Optionen → Segment. Keine Mischformen. |
| R6 | **Jede Änderung hat einen Namen im Rückgängig-Verlauf** („Fenster F-03 verschoben“). |
| R7 | **Maße im Modell sind antippbar** – für alle Bauteile, nicht nur Achsen und Öffnungen. |
| R8 | **Mehrfachauswahl zeigt gemeinsame Werte**, unterschiedliche als „verschieden“; eine Eingabe gilt für alle. |
| R9 | **Tastatur zuerst am Desktop:** jeder Befehl hat ein Kürzel (zweibuchstabig wie in AutoCAD/Revit: WA Wand, ST Stütze, FE Fenster …), Leertaste wiederholt den letzten Befehl, Rechtsklick öffnet ein Kontextmenü. |
| R10 | **Keine verdeckenden Karten auf dem Modell** am Desktop. Was schwebt, ist klein und an seinem Auslöser (Maß-Editor, Auswahlliste). |

---

## 4. Roadmap

Aufwand: S = bis 1 Tag, M = 2–4 Tage, L = 1–2 Wochen (bei der bisherigen Arbeitsweise).

### Phase 0 – Fehler sofort beheben (S–M)

| Nr. | Aufgabe | fertig, wenn |
|---|---|---|
| 0.1 | Zahlen-Leser nach R1 für **alle** Felder, R2 für die Anzeige im Feld | „1.260“, „1260“, „1,26 m“ ergeben 1260; Ändern eines angezeigten Werts ergibt nie Faktor 1000; Prüfliste mit 20 Eingaben im Selbsttest |
| 0.2 | Dialoge Fenster/Dach/Treppe/Rasterdecke an die Auswahl binden (R3), bis Phase 2 sie ersetzt | Fenster A wählen, Editor öffnen, Fenster B wählen → Editor zeigt B; Wand wählen → Editor schließt |
| 0.3 | Stützen an Wandecken und Wandenden: Wände enden stumpf an der Stützenfläche, keine Gehrung im Bereich der Stütze; Kantenlinien aus den ausgesparten Stücken zeichnen | Ecke mit Stütze zeigt in 3D und Grundriss keine Wandlinie innerhalb der Stütze; Mengen und IFC stimmen |
| 0.4 | Alte orange „ab Wandanfang“-Maße bei gewählter Öffnung entfernen | nur noch eine Maßart sichtbar |
| 0.5 | ~~Hinweis „Neue Version“~~ – entfällt, siehe F6 | – |
| 0.6 | Maßketten: Abstand zwischen Ketten benachbarter Gruppen und Zahlen ohne Überdeckung | keine überlappenden Zahlen bei Achsen ≥ 500 mm Abstand |

### Phase 1 – Desktop-Gerüst (L)

| Nr. | Aufgabe |
|---|---|
| 1.1 | Grundlayout nach 2.1: Menüband oben, Projektbrowser links, Eigenschaften rechts, Statusleiste unten; andockbar, einklappbar, Breiten gemerkt |
| 1.2 | Menüband mit Reitern nach 2.2, Symbole einheitlich (gleiche Strichstärke wie heute), große Knöpfe für häufige Befehle, kleine für seltene, Auswahlknöpfe (▾) für Varianten |
| 1.3 | Optionsleiste ersetzt die Befehlsleiste unten; Aufforderung, Koordinaten, Fang, Ortho in die Statusleiste |
| 1.4 | Kontext-Reiter je Bauteilart |
| 1.5 | Bereich „Gebäude“ (ganzseitig) ersetzt Gebäude-Dialog |
| 1.6 | Rechtsklick-Kontextmenü im Modell (Befehle für die Auswahl, Letzten Befehl wiederholen, Auswahl aufheben) |
| 1.7 | Tastaturkürzel nach R9 und eine Übersicht (Taste „?“) |
| 1.8 | iPad: Menüband einzeilig, Paletten als Seitenblätter |

### Phase 2 – Eigenschaften-Palette statt Dialoge (M–L)

| Nr. | Aufgabe |
|---|---|
| 2.1 | Eigenschaften-Palette für jedes Bauteil, gegliedert in aufklappbare Abschnitte (Typ, Lage, Abmessungen, Bezug, Mengen, IFC) |
| 2.2 | Dach, Treppe, Rasterdecke, Unterlage, Geschoss, Achse, Achsgruppe vollständig in die Palette; Dialoge entfallen |
| 2.3 | Fenster-Editor als andockbarer Bereich, an die Auswahl gebunden, für mehrere gleiche Fenster zugleich |
| 2.4 | Mehrfachauswahl nach R8 (gemischte Werte, gemeinsame Eingabe) für alle Bauteilarten |
| 2.5 | Einheitliche Bedienelemente nach R5; Segmentknöpfe nur noch für 2–3 kurze Optionen |

### Phase 3 – Bauteiltypen (L)

| Nr. | Aufgabe |
|---|---|
| 3.1 | Typen-Katalog `B.types`: Wandtypen (Schichten: Putz, Mauerwerk, Dämmung … mit Dicken, Gesamtdicke ergibt sich), Deckentypen, Stützentypen, Fenster- und Türtypen (heutige Vorlagen werden Typen) |
| 3.2 | Exemplar verweist auf Typ, überschreibt nur Abweichungen; „Typ bearbeiten“ ändert alle Exemplare |
| 3.3 | Typauswahl überall gleich: Auswahlknopf mit Vorschau und Suche; „Neuer Typ aus Auswahl“ |
| 3.4 | Schichten im Grundriss (Schraffur je Schicht, abschaltbar) und im IFC (IfcMaterialLayerSet) |
| 3.5 | Typ-Liste im Projektbrowser mit Anzahl der Exemplare |

### Phase 4 – Datenmodell festigen (M–L)

| Nr. | Aufgabe |
|---|---|
| 4.1 | Schemaversion und Migrationen statt stiller Reparatur |
| 4.2 | Gespeicherte Beziehungen: Wandverbindungen (Art: Gehrung, stumpf, durchlaufend, an Stütze), Achsbindung, Wirt; Anzeige als kleines Symbol am Bauteil, lösbar in der Palette |
| 4.3 | Höhen als Bezug + Versatz (R: „OK Rohdecke EG + 900“, „UK Decke darüber − 0“) |
| 4.4 | Räume, Decken- und Dachränder an Wände gebunden: Umriss folgt, wenn Wände sich ändern (F8) |
| 4.5 | Öffnungen mit wählbarem Bezug (Wandanfang, Wandende, Achse, Kante) |
| 4.6 | Rückgängig als benannte Änderungsliste (R6), Verlauf im Menü |
| 4.7 | Geometrie-Zwischenspeicher je Bauteil; Zielwert: Gebäude mit 2.000 Bauteilen dreht flüssig (60 Bilder/s am Mac) |
| 4.8 | `building.js` aufteilen: Daten/Migration, Geometrie, Fang, Darstellung, Oberfläche, IFC, Speicher |

### Phase 5 – Bearbeiten direkt im Modell (M–L)

| Nr. | Aufgabe |
|---|---|
| 5.1 | **Temporäre Maße** für jede Auswahl (wie bei Öffnungen): Wand (Länge, Abstände der Enden zu Nachbarwänden/Achsen), Stütze (Abstände zu den nächsten Achsen oder Wandflächen), Decke (Kantenlängen), Raum |
| 5.2 | Maße **festsetzen** (Schloss am Maß): fester Abstand bleibt beim Verschieben anderer Teile erhalten |
| 5.3 | Griffe einheitlich: Kreis = Punkt ziehen, Quadrat = verschieben, Bogen = drehen; Doppelklick auf Griff = Wert eintippen |
| 5.4 | Rahmenauswahl (links→rechts nur ganz Enthaltenes, rechts→links alles Berührte), Auswahlfilter nach Bauteilart, „Alle dieses Typs wählen“ |
| 5.5 | Flächenfang in 3D auch beim Zeichnen (F7), mit Vorrang-Regel gegenüber Ortho |
| 5.6 | Ausrichten-Befehl: Kante an Kante bündig setzen (wie Revit „Ausrichten“) |
| 5.7 | Spiegeln, Drehen, Reihe (Anzahl und Abstand) als Befehle |

### Phase 6 – Ansicht und Navigation (M)

| Nr. | Aufgabe |
|---|---|
| 6.1 | Navigationswürfel (wie Fusion 360) mit Ansichten oben/vorn/seitlich/iso und Drehen per Klick |
| 6.2 | Schnittbox und Schnittebene (Höhe einstellbar) für 3D |
| 6.3 | Gespeicherte Ansichten im Projektbrowser (Kamera, Geschoss, Layer, Schnitt) |
| 6.4 | Darstellungsstile: schattiert mit Kanten, nur Kanten, durchscheinend; Grundriss mit Schraffuren |
| 6.5 | Statusleiste mit Koordinaten des Zeigers und Maßstab |

### Phase 7 – Ausgabe und Listen (M)

| Nr. | Aufgabe |
|---|---|
| 7.1 | Listen als Tabelle: Fenster/Türen, Räume (Fläche, Umfang, Höhe), Wände je Typ (Länge, Fläche), Stützen; sortier- und filterbar, Klick wählt im Modell |
| 7.2 | Export der Listen als CSV/Excel |
| 7.3 | Grundriss als PDF mit Maßstab, Achsen, Maßketten und Raumstempeln |
| 7.4 | IFC: Typen (IfcWallType …), Schichten, Räume mit Begrenzungen, Geschoss-Höhen |

### Phase 8 – Qualität (laufend)

| Nr. | Aufgabe |
|---|---|
| 8.1 | Selbsttest Gebäude analog zum Rohr-Selbsttest: Zahlen-Leser, Raumerkennung, Wandecken mit Stützen, Achsbindung, Öffnungsmaße, IFC-Bezüge |
| 8.2 | Prüfmodelle (Einfamilienhaus, Bürokomplex, schiefer Plan) als Dateien im Projekt, vor jeder Version einmal laden |
| 8.3 | Leistungsmessung mit großem Modell |

---

## 5. Reihenfolge und Abhängigkeiten

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3
                │            │
                │            └──► Phase 5 (Maße, Griffe)
                └──► Phase 6 (Navigation)
Phase 4 (Datenmodell) läuft neben 2 und 3 mit: 4.1 vor 3.1, 4.2 vor 5.2, 4.8 vor Phase 1
Phase 7 nach 3 (Typen machen Listen sinnvoll)
Phase 8 laufend, 8.1 sofort mit Phase 0
```

Empfehlung für die nächsten Schritte:

1. **Phase 0** komplett (die drei vom Nutzer gemeldeten Fehler zuerst: 0.1, 0.2, 0.3).
2. **4.8** (Datei aufteilen) und **8.1** (Selbsttest), weil Phase 1 die ganze Oberfläche umbaut.
3. **Phase 1** – danach fühlt sich das Werkzeug am Desktop wie eine Profi-Anwendung an.
4. **Phase 2**, dann **Phase 3**.

## 6. Offene Entscheidungen

1. **Menüband oder klassische Menüleiste + Werkzeugkästen?** Empfehlung: Menüband, weil es am iPad ebenfalls trägt und Gruppen sichtbar macht. Klassische Menüs wären am Mac vertrauter, verstecken aber Befehle.
2. **Kürzel einbuchstabig (heute W, S, T …) oder zweibuchstabig?** Zweibuchstabig skaliert auf mehr Befehle; die heutigen Buchstaben könnten als Abkürzung erhalten bleiben.
3. **Wie viel Revit?** Typen und Bindungen (Phase 3/4) sind mächtig, machen das Modell aber auch strenger. Vorschlag: Bindungen immer sichtbar und mit einem Klick lösbar.
4. **Rohrbiege-Assistent:** Soll er später dasselbe Grundlayout bekommen (eigene Reiter „Rohr“, „Biegen“, „Zubehör“ im selben Menüband)? Das ist die Voraussetzung, damit Gebäude und Rohre in einer Oberfläche zusammenwachsen.

## 7. Phase 0 umgesetzt (Version 270)

| Nr. | Ergebnis |
|---|---|
| 0.1 | Ein Zahlen-Leser (`num`) für alle Felder: „1.260“, „1260“, „1 260“, „1.260,5“, „1260,5“, „1,26 m“, „126 cm“, „2*1260+115“, „(1000+260)/2“. Felder zeigen beim Bearbeiten die nackte Zahl („1260“), ein Klick markiert den ganzen Wert. Nicht lesbare Eingabe: alter Wert bleibt, Hinweis mit Beispielen. Geprüft mit 20 Eingaben. |
| 0.2 | Fenster-, Dach-, Treppen- und Rasterdecken-Dialog folgen der Auswahl: anderes Bauteil gleicher Art gewählt → Dialog zeigt es (Felder geprüft), anderes Bauteil → Dialog schließt. |
| 0.3 | Wandkanten (3D und Grundriss) werden dort nicht mehr gezeichnet, wo eine Stütze steht: Gehrung und Stoß verschwinden hinter der Stütze. Geprüft: Wandecke mit Stütze 300 × 300 – vorher 16 Linien innerhalb der Stütze, jetzt 0. |
| 0.4 | Alte Maße „ab Wandanfang“ bei gewählter Öffnung entfernt; neu ist die **Breite** als antippbares Maß (Mitte bleibt). |
| 0.5 | entfällt (F6 war kein App-Fehler). |
| 0.6 | Maßzahlen der Achsketten weichen einander aus (bis zu fünf Plätze), keine Überdeckung mehr. Die Ketten benachbarter Gruppen können sich bei sehr kleinem Abstand noch überlagern. |

Nächste Schritte laut Abschnitt 5: Datei aufteilen (4.8) und Selbsttest Gebäude (8.1), dann Phase 1.

## 8. Version 271/272: Datei aufteilen (4.8, erster Schnitt) und Selbsttest Gebäude (8.1)

- **Aufteilung:** Der zustandslose Teil von `building.js` (rund 430 Zeilen) liegt jetzt in fünf Modulen: `building-math.js` (Vektoren, Polygone, Zahlen), `building-steel.js` (Profile), `building-store.js` (IndexedDB, neues Gebäude), `building-data.js` (Symbole, Vorgaben, Vorlagen), `building-css.js` (Gestaltung). `building.js` behält die Hülle (Oberfläche, Fang, Bearbeiten, IFC) mit 3.150 Zeilen. Die Module stehen in `sw.js` für den Offline-Betrieb.
- **Noch offen in 4.8:** die Hülle selbst ist ein Block, weil Zustand (Gebäude, Auswahl, Kamera) von allen Teilen gemeinsam benutzt wird. Der nächste Schnitt braucht einen expliziten Zustand (`ctx`), den Geometrie, Fang, Darstellung, Oberfläche und IFC bekommen – das gehört zu Phase 4 und sollte vor dem Umbau der Oberfläche (Phase 1) angegangen werden.
- **Selbsttest:** `biegeDebug.bau.selfTest()` (nur im Testmodus) läuft in einem eigenen Test-Gebäude im Speicher; geöffnetes Gebäude, Rückgängig, Auswahl und Datenbank bleiben unberührt (geprüft). Zehn Fälle: Zahlen lesen (20 Eingaben), Achsabstände lesen, Raum aus vier Wänden, Wandecke mit Stütze (keine Linie in der Stütze), Stütze in der Wand (Wandkörper ausgespart), Raum zwischen Stützen und Wänden, Achsgruppen links/rechts, Achse verschieben (Stütze und Wand folgen, gelöste Stütze nicht), Fenstermaße (links + Breite + rechts = Wandlänge), IFC-Bezüge. Stand: 10 von 10 bestanden.

## 9. Phase 1 erster Stand (Version 273)

Ab **1000 px Breite** (Desktop, iPad quer) gilt das neue Gerüst, darunter bleibt die bisherige Oberfläche mit schwebenden Leisten (iPad hochkant, Telefon).

| Nr. | Stand |
|---|---|
| 1.1 | **Fertig:** Kopfzeile (Projektbrowser, Gebäude, Rückgängig/Wiederholen, Geschoss, Fertig), darunter Menüband, Optionsleiste, links Projektbrowser (angedockt, ein-/ausklappbar), Zeichenfläche, rechts Eigenschaften (angedockt, immer sichtbar, ohne Auswahl Geschossübersicht), unten Statusleiste. Nichts schwebt mehr über dem Modell; Einpassen rechnet mit der freien Fläche. *Offen:* Breiten der Paletten per Ziehen verstellbar (feste 280/330 px). |
| 1.2 | **Fertig:** Menüband mit 8 Reitern (Gebäude, Start, Tragwerk, Öffnungen, Ausbau, Raster + Plan, Messen, Ansicht), Gruppen mit Beschriftung, große Symbolknöpfe, aktiver Befehl hervorgehoben, Knöpfe ohne Auswahl bzw. ohne Planunterlage ausgegraut, Doppelklick auf den Reiter klappt das Band ein. 20 neue Symbole. |
| 1.3 | **Fertig:** Optionsleiste unter dem Band ersetzt die Befehlsleiste (erscheint nur, solange ein Befehl läuft; Listen öffnen nach unten); Statusleiste mit Aufforderung bzw. Auswahl, Zeigerkoordinaten in mm, Ortho-Schalter, Fang-Menü. |
| 1.4 | **Fertig (erste Fassung):** Kontext-Reiter rechts im Band (farbig) bei Auswahl: Wand (Teilen, Wandzug, Ecken verbinden), Fenster (Gestalten), Treppe, Dach, Rasterdecke (Raster, Rasterstart, Platten), Raum (Rasterdecke), Achse (Parallele, Neu nummerieren) plus Ändern/Auswahl. Fällt bei leerer Auswahl auf den vorigen Reiter zurück. |
| 1.5 | *Offen:* ganzseitiger Bereich „Gebäude“; Reiter „Gebäude“ im Band deckt Neu/Öffnen/Sichern/Laden/IFC/Bild ab, der Dialog „Gebäude“ bleibt für die Liste. |
| 1.6 | **Fertig:** Rechtsklick-Menü (Letzten Befehl wiederholen, Verschieben, Kopieren, Ausblenden, Löschen, Auswahl aufheben, Zoom, Grundriss/3D; bei laufendem Befehl Beenden, Ortho). Ziehen mit der rechten Taste verschiebt weiter. |
| 1.7 | **Teilweise:** Übersicht „?“ (Taste ? oder Knopf in der Statusleiste), Leertaste wiederholt den letzten Befehl. *Offen:* zweibuchstabige Kürzel. |
| 1.8 | *Offen:* iPad-Menüband (einzeilig mit Seitenblättern); iPad quer nutzt schon das Desktop-Gerüst. |

Getestet in 1500 × 900 und 820 × 900: Umschalten in beide Richtungen (Optionsleiste wandert zwischen Band und unterer Leiste), Reiter, Befehlsstart per Band mit Hervorhebung, Auswahllisten nach unten, Fang-Menü aus der Statusleiste, Kontext-Reiter und Rückfall, Eigenschaften-Palette mit Feldern (Breite „1.200“ → 1200), Dialog neben der Palette, Rechtsklick-Menü, Koordinaten, Leertaste, ?-Übersicht. Selbsttest Gebäude 10/10, Rohr 9/9, keine Konsolenfehler.

## 10. Phase 2 erster Stand (Version 274)

Gilt am Desktop (ab 1000 px); darunter bleiben die schwebenden Dialoge.

| Nr. | Stand |
|---|---|
| 2.1 | **Fertig (erste Fassung):** Eigenschaften-Palette mit einklappbaren Abschnitten **Mengen** (Länge, Höhe, Fläche …), **Bezug** (Geschoss, Wirtswand, Achsen mit „folgt/gelöst“, Sichtbarkeit) und **IFC** (Klasse, Name, Art); der Zustand jedes Abschnitts wird gemerkt. *Offen:* Abschnitt „Typ“ (kommt mit Phase 3) und die Gliederung der Felder selbst in Abschnitte (Lage, Abmessungen). |
| 2.2 | **Teilweise:** Fenster-, Dach-, Treppen- und Rasterdecken-Editor stehen nicht mehr als schwebende Karte, sondern **in der Palette**, öffnen sich beim Wählen des Bauteils von selbst, folgen der Auswahl und lassen sich mit × schließen (öffnen wieder beim nächsten Wählen). **Geschoss** (Name, OK Rohdecke, Höhe, oben/unten/Kopie/Löschen) und **Planunterlage** (Deckkraft, Drehung, Kalibrieren, Ausrichten, Verschieben, Entfernen, Laden) stehen in der Palette, wenn nichts gewählt ist. Achse und Achsgruppe waren schon in der Palette. *Offen:* Dialoge „Gebäude“, „Neues Gebäude“, „Raster erzeugen“, „Geschosse“ (Tabelle über alle Geschosse), „Unterlage laden“ und „Kürzel“ bleiben Dialoge; „Raster erzeugen“ soll in die Optionsleiste mit Vorschau im Modell. |
| 2.3 | **Teilweise:** Fenster-Editor ist an die Auswahl gebunden (Fenster A → B: Editor folgt, Wand: Editor weg). *Offen:* mehrere gleiche Fenster gleichzeitig bearbeiten (heute „Auf gleich große Fenster übertragen“). |
| 2.4 | **Teilweise:** Mehrfachauswahl zeigt unterschiedliche Werte als leeres Feld mit „verschieden“ (Wand, Stütze, Träger, Decke, Öffnungen). *Offen:* gemeinsame Werte für gemischte Bauteilarten (z. B. Geschoss, Sichtbarkeit). |
| 2.5 | *Offen:* Bedienelemente vereinheitlichen (Segmentknöpfe nur für 2–3 kurze Optionen). |

Getestet (1500 × 900): Fenster wählen → Editor in der Palette, Titel „Fenster gestalten“, Felder; anderes Fenster → Editor zeigt dessen Werte (1200/900 gegen 2760/900); Breite „1.100“ im Editor → 1100; Schließen bleibt geschlossen, Wand wählen → kein Editor, wieder dasselbe Fenster → Editor wieder da; Dach → Editor „Dachform“; nichts gewählt → Abschnitte Geschoss und Planunterlage; Geschosshöhe 2.800 → Geschosse darüber rücken mit, Name ändern und beides rückgängig; Mehrfachauswahl Wand 300/365 → „verschieden“, Eingabe 200 gilt für beide; Selbsttest Gebäude 10/10, keine Konsolenfehler.

## 11. Phase 3 erster Stand: Bauteiltypen (Version 275)

| Nr. | Stand |
|---|---|
| 3.1 | **Fertig (erste Fassung):** Typenkatalog `B.types` je Gebäude mit **29 Vorgabetypen**: 6 Wandtypen mit Schichten (Außenwand 36,5: Putz 15 + Mauerwerk 175 + Dämmung 160 + Putz 15; Stahlbeton-Wand 30; Innenwand tragend 24 und 17,5; Innenwand 11,5; Trockenbauwand 10), 5 Deckentypen (Decke 20/25/30, Bodenplatte 30/40), 7 Stützentypen (eckig, rund, Stahl), die 7 Fenstervorlagen als Fenstertypen und 4 Türtypen. Vorhandene Gebäude bekommen den Katalog beim Öffnen (`typesV`); Bauteile mit genau passenden Maßen werden verknüpft, die übrigen bleiben „Eigene Maße“. |
| 3.2 | **Fertig, mit einer Festlegung:** Das Bauteil verweist mit `typeId` auf den Typ und trägt die Werte als Kopie. **Typ bearbeiten ändert alle Exemplare** (Schichten, Maße, Name). Ändert man am Bauteil selbst einen Typwert (Dicke, Breite, Teilung …), **löst es sich vom Typ** („Eigene Maße“), statt nur die Abweichung zu merken; „Typ aus diesem Fenster übernehmen“ schreibt Änderungen ins Typ zurück. |
| 3.3 | **Teilweise:** Auswahlknopf „Typ“ oben in der Palette (auch bei Mehrfachauswahl, „verschieden“ bei gemischt), „Eigene Maße“ und **„Neuer Typ aus Auswahl …“**; Wandbefehl wählt den Typ in der Optionsleiste (eigene Dicke löst vom Typ). *Offen:* Vorschau und Suche in der Typauswahl; Typauswahl bei Stütze, Decke und Öffnung schon beim Zeichnen. |
| 3.4 | **Fertig:** Schichten im **Grundriss** (Bänder in Materialfarbe, nicht über Stützen, ab sichtbarer Dicke) und im **IFC** (IfcMaterialLayerSet je Typ, IfcRelAssociatesMaterial an alle Exemplare; Wand- und Deckentypen). *Offen:* Schraffuren, Typobjekte (IfcWallType). |
| 3.5 | **Fertig:** Reiter „Typen“ im Projektbrowser (je Art, mit Zahl der Exemplare und Aufbau; Klick wählt die Exemplare im aktuellen Geschoss). |

Getestet (1500 × 900, Testgebäude „Fangtest“): Katalog 29 Typen; Typ „Innenwand tragend 24“ → „Außenwand 36,5“ ändert Dicke 365 und Art; Schicht Mauerwerk 175 → 200 ändert alle Exemplare (390); Dicke von Hand → „Eigene Maße“; Typen-Reiter mit Zahlen; Grundriss mit Schichtbändern; Selbsttest Gebäude **16/16** (neu: Katalog, Typ ändern, lösen, Neuer Typ, Stützentyp, Fenstertyp, IFC-Schichten), keine Konsolenfehler. Der Abschnitt „Typ bearbeiten“ steht nur am Desktop (Palette); auf schmalen Geräten gibt es den Auswahlknopf.

*Bekannt:* Wände aus dem Startfenster („Neues Gebäude“) sind noch nicht typisiert, die Vorlagen im Fenster-Editor laufen neben den Fenstertypen weiter.

## 12. Phase 4 erster Stand: Datenmodell (Version 276)

| Nr. | Stand |
|---|---|
| 4.1 | **Fertig:** Schemaversion `B.schema` (jetzt 3) und Migrationskette in `building-schema.js`: jede Version mit Änderung am Datenmodell bekommt einen Schritt; Gebäude ohne Nummer werden der Reihe nach auf Stand gebracht (Schritt 1 Grundgerüst, 2 Bauteiltypen mit Verknüpfung, 3 Räume/Wandenden), ein zweiter Lauf tut nichts. Gebäude aus einer **neueren** Version bleiben unverändert und werden gemeldet. Ersetzt die stille Reparatur `fixB`/`typesV`. |
| 4.2 | **Teilweise:** **Wandecke von Hand** (gespeichert je Wandende als `ja`/`jb`): „Automatisch (Gehrung, T-Stoß)“ oder „Stumpf an die Nachbarwand“ (die Wand stößt an die Fläche der Nachbarwand, die Nachbarwand läuft bis zur Außenfläche durch); Auswahl in der Palette bei jeder Wand. Achsbindung und Wirt waren schon gespeichert bzw. sichtbar (Abschnitt „Bezug“). *Offen:* Wandverbindungen allgemein speichern (heute aus der Lage abgeleitet), Anzeige als Symbol am Bauteil, Verbindung „an Stütze“. |
| 4.3 | *Offen:* Höhen als Bezug + Versatz. |
| 4.4 | **Teilweise:** **Räume folgen den Wänden:** Ein Raum merkt sich einen Punkt im Raum (`seed`) und `auto`; ändern sich Wände oder Stützen seines Geschosses (Zeichnen, Dicke, Verschieben, Löschen, Ziehen am Griff), wird der Umriss kurz danach neu berechnet; ist der Raum nicht mehr geschlossen, bleibt der alte Umriss und die Palette meldet es. Neue Räume folgen von selbst, bei vorhandenen schaltet „Umriss: Folgt den Wänden“ in der Palette es ein. Die Aktualisierung ist kein eigener Rückgängig-Schritt (der Stand davor enthält den alten Umriss); andere Geschosse folgen beim Wechsel dorthin. *Offen:* Decken- und Dachränder, Rasterdecken. |
| 4.5 | *Offen:* Öffnungen mit wählbarem Bezug (Wandanfang, Wandende, Achse, Kante). |
| 4.6 | **Fertig:** **Verlauf** im Menüband (Start → Verlauf): die letzten 30 Schritte mit **automatisch ermittelten Namen** („Wand angelegt“, „3 × Fenster geändert“, „Achse gelöscht“, „Typ geändert“ …), aus dem Unterschied zweier Stände berechnet (kein Mitführen von Namen an jeder Änderung); Klick springt auf den Stand davor. |
| 4.7 | *Offen:* Geometrie-Zwischenspeicher, Leistungsmessung mit 2.000 Bauteilen. |
| 4.8 | *Offen:* Hülle mit explizitem Zustand aufteilen (Geometrie, Fang, Darstellung, Oberfläche, IFC). Die neuen Teile (Schema, Typen, Räume) sind wieder in `building.js`/eigenem Modul entstanden; Schema liegt jetzt in `building-schema.js`. |

Getestet (1500 × 900): Selbsttest Gebäude **21/21** (neu: Schema-Migration, neuere Version, Verlaufsnamen, Wandecke stumpf, Raum folgt und meldet „offen“); am Modell: Raum anlegen (merkt Punkt), Wand dicker → Umriss folgt (Innenfläche 10750), Verlauf zeigt „3 Bauteile geändert“, „Raum angelegt“, Sprung zurück; Wandende „Stumpf“ setzen und rückgängig; keine Konsolenfehler.

*Bekannt (nicht neu):* Bei Gehrungen zwischen Wänden unterschiedlicher Dicke weicht der Raumumriss an der Ecke vom Eckpunkt ab (z. B. (10850 | 150) statt (10750 | 150)), weil die Gehrung entlang der Winkelhalbierenden läuft. Gehört zu 4.2 (Wandverbindungen).

## 13. Phase 5 erster Stand: Bearbeiten im Modell (Version 277)

| Nr. | Stand |
|---|---|
| 5.0 (neu) | **Punkt mit Abstand von einem Bezugspunkt** für alle Zeichenbefehle (Wand, Stütze, Träger, Decke, Dach, Rasterdecke, Treppe, Schacht, Achse, Verschieben, Kopieren, Spiegeln): Knopf „Abstand“ in der Optionsleiste oder Taste **A** → Bezugspunkt tippen (mit Fang) → Richtung mit dem Zeiger zeigen (mit Ortho exakt waagerecht/senkrecht) → Abstand eintippen, Enter. Der Punkt wird dann wie ein getippter Punkt gesetzt (z. B. Startpunkt einer Wand 1.500 mm neben einer Ecke). Statt Eintippen funktioniert auch ein Tippen im Modell. |
| 5.1 | **Teilweise:** Temporäre, antippbare Maße bei gewählter **Wand** (Länge bei festem Anfang, Dicke) und **Stütze** (Abstand von jeder Seite bis zur nächsten Wandfläche oder Achse; Eingabe verschiebt die Stütze). *Offen:* Decke (Kantenlängen), Raum, Abstände der Wandenden zu Nachbarwänden und Achsen. |
| 5.2 | *Offen:* Maße festsetzen (Schloss). |
| 5.3 | *Offen:* Griffe vereinheitlichen, Doppelklick auf Griff = Wert tippen. |
| 5.4 | **Teilweise:** **Rahmenauswahl** mit **Shift + Ziehen** auf leerer Fläche (Maus): nach rechts nur ganz Enthaltenes (blau), nach links alles Berührte (grün, gestrichelt); ergänzt die Auswahl. Ziehen ohne Shift bleibt wie bisher (Verschieben bzw. Drehen der Ansicht). „Alle dieses Typs wählen“ geht über den Reiter „Typen“ im Projektbrowser. *Offen:* Auswahlfilter nach Bauteilart, Rahmen ohne Shift. |
| 5.5 | *Offen:* Flächenfang in 3D auch beim Zeichnen. |
| 5.6 | *Offen:* Ausrichten (Kante an Kante). |
| 5.7 | **Teilweise:** **Drehen** (Drehpunkt tippen, Winkel eintippen oder 90°/180°/−90°, „Drehen“ oder „Kopie drehen“) und **Spiegeln** (zwei Punkte der Achse, „Original behalten“) für Wand, Stütze, Träger, Decke, Raum und Schacht samt Türen, Fenstern und Durchbrüchen; Stützen drehen mit, Wandlage links/rechts wechselt beim Spiegeln. **Reihe** gibt es als „Kopieren“ mit Anzahl. *Offen:* Treppen, Dächer und Rasterdecken drehen/spiegeln. |

Außerdem behoben: Ein verschobener Raum, der den Wänden folgt, behält jetzt seinen Punkt im Raum (sonst wäre er zurückgesprungen).

Getestet (1500 × 900, Testgebäude „Fangtest“): Selbsttest Gebäude **24/24** (neu: Drehen 90° mit Fenster, Spiegeln mit Kopie, Raumpunkt beim Verschieben); am Modell: Abstandsmodus (Taste A, Bezugspunkt, Richtung, 1500, Enter → Punkt in 1500 mm Abstand, Modus beendet), Wandlänge 9000 → 8500 über das Maß, Stützenabstand links 4730 → 4230 verschiebt die Stütze um 500, Rahmen nach rechts 3 Bauteile / nach links 13, Drehen mit Winkelfeld, Spiegeln mit Kopie, Rückgängig; keine Konsolenfehler.

*Hinweis zum Abstandsmodus:* Die Richtung kommt vom Zeiger samt Fang; ohne Ortho kann sie auf einen gefangenen Punkt „einrasten“. Für exakt waagerecht oder senkrecht Ortho (F8) einschalten.

## 14. Phase 6 erster Stand: Ansicht und Navigation (Version 278)

**Fehler vorab behoben:** Ein **Unterzug in einer Wand** schnitt die Wand nicht aus, die Wand ragte in den Unterzug. Wände werden jetzt wie bei Stützen auch von Unterzügen und Stahlträgern ausgespart (3D, Grundriss, Mengen, IFC): im Höhenbereich des Trägers verschwindet die Wand, ist der Träger schmaler als die Wand, bleibt sie seitlich stehen; Wandkanten und Schichtbänder im Grundriss laufen nicht mehr durch den Träger. Schräg liegende Träger werden über ihr umschließendes Rechteck ausgespart (leicht großzügig).

| Nr. | Stand |
|---|---|
| 6.1 | **Fertig (einfache Fassung):** **Ansichtssteuerung** oben rechts in der Zeichenfläche (Desktop) und im Band (Ansicht → Richtung): Oben (Grundriss), Vorne, Rechts, Hinten, Links, Iso; die aktuelle Richtung ist hervorgehoben, jede Wahl passt das Modell neu ein. *Offen:* echter 3D-Würfel zum Anklicken von Flächen, Kanten und Ecken, Ziehen am Würfel. |
| 6.2 | *Offen:* Schnittbox und Schnittebene (braucht eine Beschneidung im Zeichenprogramm). |
| 6.3 | **Teilweise:** **Gespeicherte Ansichten** (Schema 4: `B.views`): Blickrichtung, Ausschnitt, Geschoss, ausgeblendete Layer und Darstellung; Reiter „Ansichten“ im Projektbrowser (Speichern, Aufrufen, Löschen) und Knopf im Band. *Offen:* Umbenennen, Ansichten für Ausgabe (PDF). |
| 6.4 | **Fertig:** **Darstellung** Schattiert, **Kanten** (nur Kanten, verdeckte Linien bleiben verdeckt) und **Röntgen** (durchscheinend); gilt für 3D und Grundriss, wird gemerkt. *Offen:* Schraffuren im Grundriss je Bauteilart. |
| 6.5 | **Fertig:** **Maßstab** im Grundriss: Balken unten links (100 mm bis 50 m, je nach Zoom) und „Maßstab ≈ 1 : n“ in der Statusleiste (bei 96 dpi); Zeigerkoordinaten gab es schon. |

Getestet (1500 × 900, Testgebäude „Fangtest“): Unterzug anlegen, in die Wand kopieren → Wandstücke zeigen den Ausschnitt 2000–2500 mm und das schmale Seitenstück, 3D-Bild; Vorne/Links/Oben/Iso mit Hervorhebung, Oben → „Maßstab ≈ 1 : 75“; Kanten und Röntgen im Bild; Ansicht speichern/aufrufen/löschen (stellt auch die Darstellung wieder her); Selbsttest Gebäude **27/27** (neu: Unterzug in der Wand, Unterzug schmaler als die Wand, Ansicht speichern und aufrufen); keine Konsolenfehler.

## 15. Phase 6 abgerundet (Version 279)

| Nr. | Stand |
|---|---|
| 6.1 | **Fertig:** **Ansichtswürfel** oben rechts (Desktop): zeigt die aktuelle Blickrichtung (Flächen Oben, Vorne, Rechts, Hinten, Links, Unten mit Beschriftung, aktuelle Fläche farbig). Klick auf eine **Fläche** = Ansicht von dort, auf eine **Ecke oder Kante** (kleine Punkte) = Schrägansicht aus dieser Richtung. Die Knöpfe daneben bleiben. *Offen:* Ziehen am Würfel zum Drehen, Ansicht von unten. |
| 6.2 | **Fertig (waagerecht):** **Schnitthöhe** über OK Rohdecke des aktuellen Geschosses (Standard 1.200 mm): Wände, Stützen, Träger, Decken und Dächer werden oberhalb gekappt, die Körper bleiben geschlossen; gilt im Grundriss und in 3D, Schalter im Band (Ansicht → Schnitt) und Abschnitt „Schnitt“ in der Palette (Höhe eintippbar); Fenster oberhalb der Schnitthöhe entfallen, Fenster, die durch den Schnitt laufen, bleiben ganz. IFC und Mengen sind nicht betroffen (Schnitt gilt nur für die Darstellung). Wird in gespeicherten Ansichten mit abgelegt. *Offen:* senkrechte Schnittebene, Schnittbox. |
| 6.3 | **Fertig:** Gespeicherte Ansichten lassen sich **umbenennen** (Stift am Eintrag; Enter übernimmt, Verlassen des Felds bricht ab); der Eintrag zeigt auch Darstellung und Schnitthöhe. |
| 6.4 | **Fertig:** **Schraffuren im Grundriss**: Mauerwerk schräg, Stahlbeton schräg mit Punkten, Dämmung Zickzack, Ständerwerk senkrecht (in den Schichtbändern der Wandtypen, ab 5 Bildpunkten Schichtdicke); Betonstützen mit Schraffur. Wände ohne Typ und Stahlstützen bleiben unschraffiert. |

Getestet (1500 × 900, Testgebäude „Fangtest“): Selbsttest Gebäude **29/29** (neu: Schnitthöhe kappt die Körper bei 1.200 mm, IFC bleibt vollständig; Ansicht umbenennen); am Modell: Schnitt an/aus im Band und in der Palette, Grundriss mit Schnitt, Maßstab „1 : 25“ und Balken, Betonstütze mit Schraffur, 3D mit Schnitt, Würfel in Grundriss und Iso, Klick auf Fläche → „Vorne“, Klick auf Oberseite → „Oben“, Ansicht speichern, Stift, Umbenennen; keine Konsolenfehler.

## 16. Phase 7 erster Stand: Listen und Ausgabe (Version 280)

| Nr. | Stand |
|---|---|
| 7.1 | **Fertig:** **Listen** (Band: Messen → Listen und Mengen): Fenster, Türen, Räume, Wände, Stützen, Decken, Typen als Tabelle in einem breiten Fenster. **Spaltenkopf** sortiert (auf/ab), Feld „Filtern“ durchsucht alle Spalten, Umschalter aktuelles Geschoss / alle Geschosse, **Zeile antippen** wählt das Bauteil im Modell (wechselt das Geschoss und zoomt darauf; bei Typen werden alle Exemplare gewählt). Summenzeile für Länge, Fläche und Volumen. Inhalt: Fenster (Typ, Breite, Höhe, Brüstung, Fläche, Wand, Teilung), Türen, Räume (Nr., Name, Fläche, Umfang, Höhe, Volumen), Wände (Typ, Art, Länge, Dicke, Höhe, Nettofläche ohne Öffnungen und Stützen/Träger, Volumen), Stützen (Form, Maß, Höhe, Volumen), Decken (Art, Dicke, Fläche ohne Durchbrüche, Volumen), Typen (Aufbau, Exemplare, Menge). |
| 7.2 | **Teilweise:** **CSV** je Liste (Knopf „CSV“, Semikolon, Dezimalkomma, UTF-8 mit Kennzeichen: öffnet in Excel mit deutschen Einstellungen direkt; berücksichtigt Sortierung und Filter, Summenzeile am Ende). *Offen:* echte .xlsx-Datei, alle Listen in einer Datei. |
| 7.3 | **Fertig (erste Fassung):** **Plan als PDF** (Band: Gebäude → Ausgabe und Messen → Ausgabe): Vektor-PDF (ohne Bibliothek erzeugt) auf A4 oder A3 quer, Maßstab passend oder 1:50 / 1:100 / 1:200; Wände mit Schichten (Bänder in Materialfarbe), Stützen, Türen mit Schwenkbogen, Fenster, Raumflächen, **Achsen mit Köpfen und Maßketten** (Einzelmaße und Gesamtmaß je Gruppe und Seite), **Raumstempel** (Nr., Name, Fläche), Maßstabsbalken 1 m / 5 m, Schriftfeld (Gebäude, Geschoss, Maßstab, Datum). Das PDF wurde mit pdf.js gelesen und im Bild geprüft. *Offen:* Schraffuren und Treppen im PDF, mehrere Geschosse in einer Datei, Schnittdarstellung, Wahl von Linienstärken, Hochformat. |
| 7.4 | **Fertig (erste Fassung):** IFC mit **Typobjekten** (IfcWallType, IfcSlabType, IfcColumnType, IfcWindowType, IfcDoorType, verbunden über IfcRelDefinesByType), **Raumbegrenzungen** (IfcRelSpaceBoundary zu den Wänden und Stützen am Raumumriss, ohne Geometrie) und **Geschosshöhe** (Pset_BuildingStoreyCommon.GrossHeight); Schichtaufbau gab es schon. *Offen:* Geometrie der Raumbegrenzungen, Typen mit Schichtaufbau am Typobjekt statt an den Exemplaren, Prüfung in einem IFC-Programm. |

Getestet (1500 × 900, Testgebäude „Fangtest“): Selbsttest Gebäude **33/33** (neu: Listen mit Summen, Sortieren, Filtern; Fenster-, Raum-, Stützen- und Typenliste; CSV mit Kennzeichen und Dezimalkomma; PDF mit gültiger Objekt- und Verweistabelle, Stempel und Maßstab; IFC mit Typobjekten, Raumbegrenzung und Geschosshöhe ohne fehlende Bezüge); am Modell: Liste Wände (11 Zeilen, Summe 62,86 m Länge), Sortieren, Filter „Innen“ → 5, Zeilenklick wählt, Wechsel der Liste setzt den Filter zurück, CSV-Datei, PDF-Dialog (A3, 1:100) mit Datei; das PDF mit Achsen und Maßketten im Bild geprüft; keine Konsolenfehler. Ein Fehler beim Testen behoben: Schriftgrößen im PDF waren um den Faktor 2,8 zu groß.

## 17. Phase 8 und Gesamtstand (Version 281 bis 283)

### Neu in dieser Runde

- **Projektbrowser, Reiter:** Die vier Reiter (Struktur, Layer, Typen, Ansichten) passen jetzt nebeneinander; „Ansichten“ war am rechten Rand abgeschnitten („Ansichte“). Die Reiter richten ihre Breite nach dem Text.
- **Doppelflügeltür mit ungleichen Flügeln:** Eine Tür hat jetzt einen oder zwei Flügel (`leaves`: Breite, Anschlag links/rechts, Aufschlag hier/drüben je Flügel). **Tür-Editor** in der Palette (öffnet sich beim Wählen einer Tür, Knopf „Tür gestalten …“ in der Tafel): Breite und Höhe, Einflügelig/Zweiflügelig, **Gangflügel- und Standflügelbreite** als Felder (der zweite Flügel ergibt sich aus der Türbreite), Aufteilung per Knopf (gleich, 2/3 : 1/3, 885 + Rest, 1010 + Rest), Anschlag und Aufschlag je Flügel. Ändert man die Türbreite, behalten die Flügel ihr Verhältnis. Im **Grundriss** und im **PDF** hat jeder Flügel sein Blatt mit eigenem Schwenkbogen, in **3D** erscheinen die Türblätter als Platten (je Flügel, mit Fuge), im **IFC** eine Platte je Flügel, Öffnungsart „DOUBLE_DOOR_SINGLE_SWING“ bzw. SINGLE_SWING_LEFT/RIGHT und die Flügelbreiten als Eigenschaft. **Türtypen:** drei Doppeltüren in den Vorgaben (88 + 88, 88,5 + 37,5, 101 + 50); Flügelbreiten gehören zum Typ („Typ aus dieser Tür übernehmen“); die **Türliste** zeigt die Flügel („2 Flügel: 885 + 375“).
- **Palettenbreite per Ziehen:** Griffe zwischen Projektbrowser, Zeichenfläche und Eigenschaften (Desktop, 200–520 bzw. 260–640 px), Breite wird je Gerät gemerkt.
- **Auswahl einschränken:** Bei gemischter Mehrfachauswahl bietet die Palette Knöpfe „Wand (11)“, „Stütze (5)“ …, die die Auswahl auf eine Art begrenzen.
- **Startfenster:** Wände und Decken, die „Neues Gebäude“ anlegt, tragen jetzt gleich ihren Typ.
- **Excel (.xlsx) ohne Bibliothek:** in den Listen „Excel“ (diese Liste) und „Alle Listen“ (sieben Blätter, fixierte Kopfzeile, Zahlen als Zahlen, Summenzeile); Prüfsummen und XML werden im Selbsttest gegengeprüft.
- **Plan als PDF für alle Geschosse:** „Geschosse: Alle“ erzeugt eine Seite je Geschoss.
- **Geschwindigkeit:** Die Ansicht merkt sich je Bauteil ihre Dreiecke und Linien (Schlüssel aus Geschoss, Nachbargeschossen, Schächten/Durchbrüchen, Ansicht, Schnitt, Auswahl); Auswahl ändern oder ein Bauteil bearbeiten baut nur das betroffene Geschoss bzw. das gewählte Bauteil neu. Wände, Stützen, Träger, Öffnungen und Decken werden beim Aufbau je Geschoss vorsortiert statt je Wand durchsucht. Gemessen an einem Modell mit 2.358 Bauteilen (9 Geschosse): erster Aufbau etwa 2 s, Auswahl wechseln rund 0,15 s.

### Phase 8: Qualität

| Nr. | Stand |
|---|---|
| 8.1 | **Fertig:** Selbsttest Gebäude (`biegeDebug.bau.selfTest()`) mit **41 Fällen** (Zahlen, Räume, Stützen und Unterzüge in Wänden, Achsen, Öffnungsmaße, Typen, Verlauf, Schema, Wandecken, Raum folgt, Drehen/Spiegeln, Ansichten, Schnitt, Zwischenspeicher, Listen, CSV, Excel, PDF, Doppeltür, IFC). Läuft in einem Testgebäude im Speicher, ändert nichts am geöffneten Gebäude. |
| 8.2 | **Fertig:** **Prüfmodelle** als Dateien im Ordner `pruefmodelle/`: `einfamilienhaus.json` (2 Geschosse, Außen- und Innenwände, 11 Fenster, 6 Türen mit einer ungleichen Doppeltür, 7 Räume, Achsen, Bodenplatte und Decke) und `buerokomplex.json` (4 Geschosse, Stützenraster 6 × 4 mit 96 Stützen, Kern, 112 Fenster, Unterzüge, 264 Bauteile). Beide sind bewusst **ohne Schemanummer** gespeichert, damit das Öffnen der Migrationskette mitgeprüft wird. `biegeDebug.bau.modelTest()` prüft je Modell: Migration, Zahl der Bauteile, Lage der Öffnungen, Wiedererkennung aller Räume (Fläche), Wandstücke, alle Listen, IFC (vollständige Verweise, Anzahl Wände/Fenster/Türen/Geschosse), PDF je Geschoss: **16 von 16 bestanden**. Ein schiefer Plan wird im Selbsttest über „Plan ausrichten“ geprüft (3,2° Schräge → Drehung −3,2°). |
| 8.3 | **Fertig:** Leistungsmessung `biegeDebug.bau.perfTest()` mit einem erzeugten Modell von 2.358 Bauteilen: Ansicht aufbauen, Wandstücke, Raumerkennung, Änderungsprüfung, Liste, PDF, IFC mit Grenzwerten; alle bestanden (Stand auf dem Prüfrechner: Ansicht 2,2 s, IFC 0,5 s, Raum 0,1 s, PDF 0,02 s). |

### Gesamtstand aller Phasen

| Phase | Stand | Was noch offen ist |
|---|---|---|
| 0 Fehler | fertig (Version 270) | – |
| 1 Desktop-Gerüst | fertig bis auf Kleinigkeiten | ganzseitiger Bereich „Gebäude“, zweibuchstabige Kürzel, einzeiliges Band für das iPad hochkant |
| 2 Eigenschaften-Palette | größtenteils | mehrere gleiche Fenster gleichzeitig im Editor, gemeinsame Werte bei gemischter Auswahl, „Raster erzeugen“ in die Optionsleiste, Vereinheitlichung der Bedienelemente |
| 3 Bauteiltypen | größtenteils | Vorschau und Suche in der Typauswahl, Typ schon beim Zeichnen von Stütze, Decke und Öffnung wählen, Typ bearbeiten auf schmalen Geräten |
| 4 Datenmodell | teilweise | Höhen als Bezug plus Versatz (4.3), allgemeine Wandverbindungen speichern, Decken-/Dachränder folgen den Wänden, Aufteilung der Hülle mit ausdrücklichem Zustand (4.8) |
| 5 Bearbeiten im Modell | teilweise | Maße für Raum (Räume folgen den Wänden), Dach und Abstände der Wandenden, Maße festsetzen, einheitliche Griffe, Flächenfang in 3D beim Zeichnen, Ausrichten, Drehen/Spiegeln von Treppen, Dächern und Rasterdecken |
| 6 Ansicht | größtenteils | senkrechte Schnittebene und Schnittbox, Ziehen am Würfel, Ansicht von unten |
| 7 Listen und Ausgabe | größtenteils | PDF: Schraffuren, Treppen, Hochformat, Linienstärken; IFC: Geometrie der Raumbegrenzungen, Schichtaufbau am Typobjekt |
| 8 Qualität | fertig | – |

Warum nicht alles bis zum Schluss: Die offenen Punkte in 4 und 5 berühren das Zeichnen und die Datenhaltung an vielen Stellen (Höhenbezüge, Verbindungen, Hülle aufteilen) und sollten mit dir zusammen in kleinen Schritten angegangen werden, weil sie das Verhalten vorhandener Gebäude ändern.

### Nachtrag (Version 284)

- **4.5 Öffnungen mit wählbarem Bezug – fertig:** Bei Fenster, Tür und Wanddurchbruch wählt „Lage messen ab“ **Wandanfang** oder **Wandende**. Mit Wandende zeigt die Palette „bis Wandende“, und wird die Wand länger oder kürzer (Maß, Ziehen am Griff, Eingabe), **bleibt der Abstand zum Wandende**; ändert man die Lage selbst, gilt die Eingabe. Standard bleibt Wandanfang.
- **5.1 Maße der Decke – fertig für Decken und Bodenplatten:** Länge jeder Kante als antippbares Maß außen neben der Kante. Bei rechtwinkligen Vierecken verschiebt die Eingabe die gegenüberliegende Kante mit (Rechteck bleibt Rechteck), sonst nur die Endecke der Kante.
- Selbsttest Gebäude **43 von 43**, Prüfmodelle 16/16, Leistungsmessung ohne Überschreitung.
