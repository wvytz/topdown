# Game Design Document: Tower Crawler (Tytuł roboczy)

## 1. Koncepcja główna
Top-down Action RPG 2D. Gracz przemierza kolejne piętra wieży/lochu. Każde piętro składa się z proceduralnie połączonych pokojów, hord wrogów, łupów oraz komnaty bossa ze schodami na kolejne piętro.

## 2. Pętla rozgrywki (Core Loop)
1. Wejście na piętro N (losowa siatka pokojów).
2. Eksploracja, walka z mobami, zbieranie złota/przedmiotów.
3. Odnalezienie komnaty bossa (zablokowane wyjście).
4. Pokonanie bossa -> odblokowanie schodów na piętro N+1.
5. Skalowanie trudności: +HP wrogów, +obrażenia, nowe modyfikatory pięter.

## 3. Kluczowe systemy (Architektura)
- **Dungeon Generator:** Siatka kafelków (BSP lub pokoje łączone korytarzami). Każde piętro ma punkt startowy gracza i komnatę bossa.
- **Sterowanie:** WASD / strzałki (ruch), kursor myszy (celowanie/kierunek ataku), LPM (atak podstawowy / strzał), Spacja/PPM (dash lub umiejętność).
- **Combat & Stats:** System HP, prędkości ruchu, obrażeń, cooldownów ataków oraz hitboxów pocisków/ataków wręcz.
- **AI Przeciwników:** Prosta maszyna stanów (FSM: IDLE, CHASE, ATTACK). Różne archetypy: Melee rusher, Ranged kiter, Boss (sekwencyjne ataki obszarowe).