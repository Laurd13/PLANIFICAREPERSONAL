# Planificare Ture Personal

Aplicatie web completa (frontend + backend) pentru planificarea turelor conform Codului muncii din Romania.

## Instalare si rulare

```bash
npm install
npm start
```

Aplicatia ruleaza pe `http://localhost:3000`.

### Autentificare demo

- Utilizator: `admin`
- Parola: `admin`

## Reguli legale implementate (rezumat)

- 8 ore/zi, 40 ore/saptamana pentru norma de baza.
- maxim 48 ore/saptamana (inclusiv ore suplimentare) cu verificare pe saptamana.
- minimum 12 ore de odihna intre doua ture.
- minimum 48 ore consecutive repaus saptamanal.
- munca de noapte intre 22:00-06:00, max 8 ore de noapte in 24h.
- limita de 40% ore de weekend fata de totalul orelor lunare.

## Functionalitati

- gestionare angajati si concedii.
- configurare manuala a numarului de persoane pe tura.
- generare program cu algoritm greedy si modificare manuala drag-and-drop.
- raportare ore lucrate, ore weekend, ore suplimentare.
- export CSV pentru rapoarte.
