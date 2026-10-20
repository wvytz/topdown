-- Krok 89: bohater przy wpisie na wspólnej liście. Jednorazowo dla bazy utworzonej przed krokiem 89
-- (ponowne uruchomienie zgłosi „duplicate column” — to znaczy, że kolumna już jest).
ALTER TABLE scores ADD COLUMN hero TEXT;
