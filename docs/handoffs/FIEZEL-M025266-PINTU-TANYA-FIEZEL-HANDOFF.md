# m025-266 — Pintu ke layar Tanya FIEZEL + gerbang layar yatim

Rilis ini **tidak menambah fitur**. Layar Tanya FIEZEL (`askView()` di `app.js`: indeks materi
lokal `features/search/fiezel-search.js` + jawaban AI panjang dengan disclosure) sudah selesai
sejak m025-105. Yang rilis ini kerjakan hanya satu hal: **membuatnya bisa ditemukan lagi**, dan
memasang gerbang supaya kelas bug ini tidak kembali.

Kewenangan atas bentuk/letak pintu tetap di **OWNER**; lihat bagian 5. Koordinasi mengikuti
prosedur **MASTER** (`coordination/BUILD-VERSION.json`, gerbang `coordination-guard`).

**Status: SELESAI di sisi kode; menunggu review OWNER atas letak pintu (bagian 5).**

---

## 1. Akar masalah: janji di komentar yang tidak ditepati kode

m025-254 (Sistem Notifikasi Tugas Guru ↔ Murid) mengganti tombol "Tanya FIEZEL" di topbar
dengan lonceng notifikasi. Komentar `index.html` di tempat itu berbunyi:

> Menggantikan pintu topbar "Tanya FIEZEL" (askView tetap ada; aksesnya lewat pembimbing PAW).

Klausa kedua tidak pernah diimplementasikan. `features/ui/fiezel-coach-bubble.js` tidak
memanggil `go('ask')`, tidak ada `data-view="ask"`, tidak ada kartu di Home maupun Latihan.
Hasilnya sejak m025-254 sampai m025-265 (sebelas build):

| Yang ada | Yang hilang |
|---|---|
| `'ask'` dan `'search'` di `VALID_VIEWS` | satu pun pemanggil `go('ask')` / `go('search')` |
| `askView()` digambar `renderInner()` | jalan murid untuk sampai ke sana |
| 12 kunci i18n `ask.*` id+th, CSS `.ask-page`, `.ask-box` | pengguna yang pernah melihatnya |
| `tests/search-feedback-test.js` hijau | ia hanya menjaga "rute terdaftar" + "rute menggambar sesuatu" |

Ini persis pola kegagalan yang disebut kontrak repo: pagarnya ada, barangnya harus
didaftarkan dengan tangan, dan tidak ada yang memaksa siapa pun ingat.

## 2. Perbaikan — menepati janji komentar, bukan mengembalikan tombol topbar

Pintu dipasang di **kepala panel pembimbing PAW** (`.fz-coach-head`), chip kecil "Cari materi"
di sebelah tombol tutup. Ketuk → panel menutup → `go('ask')`.

Kenapa di sana, bukan mengembalikan tombol topbar:

- Topbar sudah penuh (lonceng + pengaturan + versi); m025-254 memutuskan lonceng lebih
  penting, dan keputusan itu tidak dibalik di sini.
- Panel pembimbing adalah tempat murid sudah **sedang bertanya**. Panel itu menjawab satu
  kalimat; layar Tanya FIEZEL menjawab panjang + menunjukkan materi terkait dari indeks lokal.
  "Cari materi" adalah eskalasi alami dari percakapan pendek ke halaman penuh.
- Komentar index.html memang menjanjikan tempat ini.

### Pembagian tanggung jawab (kenapa `go('ask')` ada di app.js, bukan di modul gelembung)

`app.js` meneruskan `openAsk:()=>go('ask')` lewat opsi `FiezelCoachBubble.install()`.
Modul gelembung hanya melahirkan tombolnya **kalau** `openAsk` adalah fungsi; ia tidak pernah
tahu nama rute. Dua alasan:

1. Modul gelembung dipasang juga di Node (gerbang `paw-mascot-test`) tanpa `go()`; tombol
   yang menuju ke mana-mana lebih buruk daripada tidak ada tombol.
2. Gerbang di bagian 3 mencari `go('ask')` di kode produksi; nama rute yang hidup di
   `app.js` — tempat `VALID_VIEWS` juga hidup — adalah tempat yang ia periksa.

### Berkas yang disentuh

| Berkas | Perubahan |
|---|---|
| `app.js` `syncCoachBubble()` | opsi `openAsk` |
| `features/ui/fiezel-coach-bubble.js` | tombol `.fz-coach-ask-page` (`data-testid="coach-open-ask"`) + handler close→openAsk |
| `features/i18n/copy-id-feat-b.js` / `copy-th-feat-b.js` | kunci `coach.cari-materi` ("Cari materi" / "ค้นหาเนื้อหา") |
| `style.css` | `.fz-coach-ask-page` (bentuk chip, sejajar `.fz-coach-chip`) |
| `core-config.js`, `sw.js`, `fiezel-diag-panel.js`, `coordination/BUILD-VERSION.json` | m025-265 → m025-266 |

Nol perubahan pada `askView()`, `features/search/`, kunci `ask.*`, maupun arsitektur i18n.

## 3. Gerbang baru: `tests/view-reachability-test.js`

Menutup satu berkas bukan menutup kelas cacatnya. Gerbang ini menuntut: **setiap layar di
`VALID_VIEWS` punya minimal satu pintu di kode produksi.** Tidak ada daftar yang diketik:

1. **Daftar view** dibaca dari literal `VALID_VIEWS` di `app.js`.
2. **Kelompok alias** dibaca dari `renderInner()`: view yang digambar fungsi yang sama
   (`ask`/`search` → `askView`, `skills`/`listening`/`speaking` → `skillsLab`,
   `online`/`profile` → `onlineView`) adalah satu layar dengan beberapa nama — cukup salah
   satu berpintu. Ini yang menjaga rute lama tetap sah untuk back-nav (aturan m025-246) tanpa
   menuntut tombol untuk setiap nama.
3. **Pintu** dipindai dari `index.html`, `app.js`, `features/**/*.{js,html}` di luar komentar,
   dua bentuk: `go('<view>')` literal, dan properti `view:'<view>'` pada kartu berbasis data
   yang templatnya memanggil `go('${c.view}')` (`latihanCards()`, hub Home). Tanpa bentuk
   kedua, `writing` terbaca yatim padahal kartunya ada.
4. Arah balik: setiap `go('<x>')` literal harus menuju nama yang ada di `VALID_VIEWS` —
   tombol yang selalu berakhir di toast "halaman tak tersedia" adalah sisi lain bug yang sama.

Bukti gerbang bekerja (dijalankan lokal, 6 Sep 2026):

```
# app.js dari main + berkas lain dari branch ini
FAIL layar ask/search (askView()) punya pintu ... [0 pintu - LAYAR YATIM]
view-reachability: 49/50 lulus   -> exit 1

# branch ini utuh
view-reachability: 51/51 lulus   -> exit 0
```

Terdaftar di `.github/workflows/quality.yml` tepat sesudah `search-feedback-test.js`.

## 4. Temuan sampingan yang TIDAK dikerjakan di sini (satu masalah, satu PR)

- `features/ui/fiezel-coach-bubble.js` `chips()` baris ~389–392 masih memuat tiga kalimat
  Indonesia langsung di kode (`'Cara inget kata baru?'`, `'Cek tulisanku dong'`,
  `'Tips biar cepat lancar?'` + pertanyaannya) — melanggar aturan "setiap teks lahir dua
  bahasa". Murid Thai melihat chip Indonesia. Kandidat PR berikutnya (prioritas 1: rusak
  untuk murid Thai).
- `bubble.setAttribute('aria-label', 'Buka pembimbing FIEZEL')` — sama.

## 5. Yang perlu OWNER putuskan

- **Letak pintu.** Kepala panel pembimbing dipilih karena itu yang dijanjikan komentar
  m025-254. Alternatif yang sama sahnya: kartu di tab Latihan (`latihanCards()`) — lebih
  terlihat, tetapi menambah kartu keenam di rak yang OWNER minta tetap ringkas (m025-246).
  Kalau OWNER memilih Latihan, gerbang bagian 3 tetap hijau tanpa perubahan.
- **Label.** "Cari materi" menonjolkan indeks lokal (fungsi yang tidak dimiliki panel).
  Kalau OWNER lebih suka "Tanya lebih panjang" atau memakai kembali `ask.judul`
  ("Tanya FIEZEL"), ganti nilai kunci `coach.cari-materi` di kedua berkas i18n.

## 6. Langkah berikutnya

1. Review + merge PR ini.
2. PR terpisah: pindahkan tiga chip + aria-label gelembung ke pasangan `copy-*-feat-b.js`
   (bagian 4).
3. Setelah beberapa hari di produksi: cek `usage` analytics apakah view `ask` mulai
   muncul; kalau nol, letak pintu (bagian 5) perlu dipertimbangkan ulang.
