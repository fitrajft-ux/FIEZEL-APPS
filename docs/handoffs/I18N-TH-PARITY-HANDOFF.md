# Paritas i18n Thai: mengapa pendaftarannya harus otomatis

Otoritas: OWNER. Dokumen ini menutup satu lubang yang sudah berbulan-bulan mengirim layar
berbahasa campur ke murid Thai tanpa satu pun gerbang berubah merah, dan mencatat kontrak
yang harus dijaga siapa pun yang menambah teks ke FIEZEL berikutnya.

## Aturannya, satu kalimat

**Setiap teks yang dilihat pengguna lahir dua bahasa — Indonesia dan Thai — atau tidak lahir
sama sekali.**

FIEZEL punya murid Thai. Kunci yang hanya ditulis dalam Indonesia tidak sampai kepada mereka
sebagai teks yang hilang; ia sampai sebagai kalimat Indonesia di tengah layar Thai. Fallback
per-kunci memang desain yang benar untuk ketahanan runtime — satu kunci rusak tidak boleh
mematikan sesi belajar — tetapi ia juga desain yang **menyembunyikan lubang dari mata
pengembang**. Yang terlihat bukan layar rusak, melainkan layar yang berfungsi dalam bahasa
yang salah.

## Apa yang rusak, dan kenapa tidak ada yang menangkapnya

`tests/th-coverage-test.js` sudah lama menegakkan hal yang benar: paritas kunci ID↔TH nol
selisih per domain, paritas himpunan `{placeholder}` per kunci, dan setiap nilai th wajib
ber-aksara Thai. Gerbangnya bagus. Yang bocor adalah **pendaftarannya**.

Daftar domainnya dulu sebuah array yang diketik tangan:

```js
const DOMAINS = ['core', 'app-a', …, 'grammar-labels'];   // 15 nama
```

Array semacam itu memeriksa dengan ketat apa yang tercantum di dalamnya, dan **buta total**
terhadap yang tidak. Domain baru lolos hijau tanpa pernah menyentuh Thai — kecuali penulisnya
ingat menyunting array ini. Tidak ada apa pun yang memaksanya ingat.

Menyalakan pendaftaran otomatis langsung menemukan **dua** lubang yang sudah berjalan di
produksi:

1. **`copy-id-redesign.js` — 76 kunci, tanpa kembaran th sama sekali.** Lahir di `m025-246`,
   dimuat di produksi lewat `index.html`, tidak pernah masuk array. Isinya justru permukaan
   yang paling sering dilihat: navigasi 4 tab, Home "Hari ini", ringkasan akhir sesi, tema
   malam, keadaan gagal audio.

2. **`copy-*-student.js` — 287 kunci yang tidak pernah terukur.** Domain ini mendaftar lewat
   `overrideCopy`, sementara stub pemuat gerbang hanya menyediakan `registerCopy`. Berkasnya
   `return` lebih awal, gerbangnya menghitung nol kunci, dan array yang diketik tangan
   menyembunyikan kejanggalan itu karena `student` memang tidak tercantum. Setelah stubnya
   dilengkapi, ketahuan 2 kuncinya belum punya th.

Keduanya lolos karena alasan yang sama: **pagarnya ada, pendaftarannya manual.**

## Kontrak yang harus dijaga

1. **Daftar domain DITEMUKAN, tidak diketik.** `DOMAINS` dibaca dari isi
   `features/i18n/` dengan pola `copy-(id|th)-<domain>.js`. Membuat `copy-id-apa-pun.js`
   otomatis menuntut `copy-th-apa-pun.js`, dan sebaliknya. Jangan pernah mengembalikannya
   menjadi array literal — itu memulihkan persis lubang yang dokumen ini tutup.

2. **Stub pemuat wajib menyediakan SETIAP pintu yang dipakai berkas copy.** Hari ini ada dua:
   `registerCopy` (kunci baru) dan `overrideCopy` (menimpa kalimat yang sudah ada). Berkas
   copy menyerah lebih awal bila pintunya tidak ada, dan modul yang menyerah menghitung nol
   kunci — hijau yang berarti "tidak diukur", bukan "tidak ada lubang". Pintu ketiga kelak
   harus ikut ditambahkan ke stub pada commit yang sama.

3. **Utang dicatat bertanggal, bukan didiamkan.** `UTANG_TANPA_TH` (domain tanpa kembaran)
   dan `UTANG_KUNCI` (kembarannya ada, sebagian kunci belum) menahan lubang yang sudah
   terlanjur ada saat pagar dipasang, supaya pagarnya bisa berdiri hari ini tanpa menyandera
   perbaikan yang butuh penutur Thai. Keduanya dicetak pada setiap kali gerbang berjalan,
   jadi tidak bisa hilang dari pandangan. Aturannya:
   - **Bukan tempat pekerjaan baru.** Menambah nama ke sini = memilih mengirim layar
     berbahasa campur. Tulis `copy-th`-nya.
   - Setiap entri wajib punya tanggal dan alasan.
   - **Utang yang sudah lunas wajib dicoret**; gerbangnya merah bila sebuah entri ternyata
     kuncinya sudah diterjemahkan. Tanpa aturan ini, daftar pengecualian mati akan
     diam-diam melonggarkan gerbang untuk domain lain kelak.

## Utang yang terbuka saat dokumen ini ditulis

| Domain | Lubang | Sejak |
| --- | --- | --- |
| `redesign` | 76 kunci, tanpa `copy-th-redesign.js` | 2026-09-05 |
| `student` | 2 kunci: `grammar.materi-new-memiliki-item-valid`, `fsl.exam-format-kicker` | 2026-09-05 |

Keduanya menunggu terjemahan yang ditinjau penutur Thai. Owner tidak menguasai bahasa Thai,
jadi terjemahan yang dikarang model tanpa peninjauan bukan penyelesaian — ia hanya
memindahkan lubangnya ke tempat yang tidak bisa dilihat siapa pun.

## Berikutnya

- Pertimbangkan gerbang yang menolak literal kalimat berbahasa Indonesia yang muncul langsung
  di `app.js`/modul fitur tanpa melewati `FiezelI18n.t`. Hari ini kontrak itu hanya dijaga
  kebiasaan; `id-golden-snapshot-test` menjaga kalimatnya tidak BERUBAH, bukan bahwa ia
  didaftarkan lewat i18n.
- Lapisan konten th non-copy (bank soal, naskah brain, kosakata) sudah punya gerbangnya
  sendiri di berkas yang sama. Pola "daftar yang diketik tangan" tidak dipakai di sana —
  ketiganya menghitung terhadap sumber kebenaran masing-masing. Biarkan begitu.
