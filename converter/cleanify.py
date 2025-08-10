import pandas as pd

# CSV einlesen (falls ; als Trenner: sep=';')
df = pd.read_csv('bibelverse_schoeningh.csv', encoding='utf-8')

# Über alle Spalten: jedes # ersetzen
df = df.replace('#', '', regex=True)

# Ergebnis abspeichern
df.to_csv('bibelverse_schoeningh_clean.csv', index=False, encoding='utf-8')
