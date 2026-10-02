# Omzetin

Omzetin adalah kasir dan pelaporan keuangan F&B berbahasa Indonesia. Implementasi ini mendukung beberapa owner, usaha, dan outlet dengan alur buka shift, menerima pembayaran, menyerahkan pesanan, mengurangi bahan, dan membukukan transaksi ke jurnal.

Frontend menggunakan React dan Vite, API menggunakan Hono, dan database menggunakan PostgreSQL. Lokal memakai PGlite persisten; deployment disiapkan untuk Cloudflare Workers dengan Static Assets dan Neon. Aplikasi belum diunggah ke cloud.

## Menjalankan lokal

Gunakan Node.js 22.12 atau lebih baru dan pnpm 10.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Buka http://127.0.0.1:5173. Akun demo lokal:

- Email: `demo@omzetin.local`
- Kata sandi: `OmzetinDemo123!`

Menu, resep, stok pembukaan, dan modal awal adalah data simulasi yang diberi label demo. Tidak ada penjualan palsu yang disisipkan. Data lokal tersimpan di `.local/data` dan bertahan setelah aplikasi dimulai ulang. PGlite menjalankan PostgreSQL di proses API, sehingga instalasi server database terpisah tidak diperlukan untuk mencoba aplikasi.

## Fitur yang tersedia

| Area     | Implementasi                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Akses    | Login, sesi 8 jam, beberapa owner per usaha, satu akun untuk beberapa usaha, penugasan kasir per outlet, pembatasan endpoint dan data sesuai peran                                                |
| Kasir    | Pencarian dan kategori menu, keranjang tersimpan per perangkat, pengguna, dan outlet, dine in atau takeaway, catatan, diskon pemilik, pembayaran tunai dan digital manual, kembalian, struk cetak |
| Pesanan  | Antrean setelah pembayaran, penyerahan, refund penuh, pembatalan sebelum produksi, waste bila pembatalan terjadi setelah produksi                                                                 |
| Shift    | Modal dari brankas, hitung kas fisik, alasan selisih yang ditinjau pemilik, setoran ke brankas, riwayat shift                                                                                     |
| Bahan    | Resep per porsi, cadangan untuk pesanan, stok tersedia, pembelian, waste, stok opname, nilai bahan dengan biaya rata-rata tertimbang                                                              |
| Keuangan | Modal, transfer kas atau bank, biaya terbayar, clearing digital, pencairan dengan biaya penyedia terpisah                                                                                         |
| Laporan  | Filter tanggal dan cakupan outlet atau seluruh outlet dalam usaha, hasil usaha, pergerakan kas dan bank, neraca saldo akhir, jurnal asal, ekspor CSV                                              |
| Kontrol  | Transaksi atomik, idempotensi retry, pemeriksaan stok dan saldo, jurnal seimbang di database, audit, kunci periode, zona waktu Indonesia                                                          |

Pembayaran masuk sebagai uang muka pelanggan. Penjualan dan HPP diakui saat pesanan diserahkan. Bahan dicadangkan saat dibayar, lalu dikonsumsi saat diserahkan. Refund sesudah penyerahan tidak mengembalikan bahan ke stok; refund sebelum penyerahan dapat melepas cadangan atau mencatat waste. Angka uang memakai perhitungan desimal tepat; harga dan resep disalin ke pesanan agar perubahan menu tidak mengubah transaksi sebelumnya.

Harga dan pembayaran menggunakan rupiah bulat. Kuantitas serta nilai biaya bahan disimpan dengan enam angka desimal dan tampilan rupiah dibulatkan untuk keterbacaan. Jurnal tetap memakai angka yang disimpan, sehingga pembulatan tampilan tidak mengubah saldo.

## Mengelola owner dan outlet

Gunakan pemilih usaha dan outlet di kanan atas untuk berpindah konteks. Transaksi, persediaan, modal, kunci periode, dan shift berlaku pada outlet aktif. Outlet berbeda dapat membuka shift bersamaan. Keranjang pada outlet sebelumnya tetap tersimpan terpisah.

Di Pengaturan, pilih Tambah outlet untuk membuat cabang dalam usaha aktif. Menu, resep, dan daftar bahan dapat disalin; kuantitas, cadangan, dan nilai bahan dimulai dari nol. Modal pembukaan dicatat sebagai modal baru, sehingga tidak menarik dana dari outlet asal. Transaksi stok atau dana antaroutlet belum memiliki alur transfer khusus.

Gunakan Pengguna untuk menambahkan owner atau menugaskan kasir. Owner berlaku untuk seluruh outlet usaha, sedangkan kasir dapat dipilihkan satu atau beberapa outlet. Jika email sudah terdaftar, akun tersebut diberi akses tanpa mengubah nama atau kata sandinya; kata sandi boleh dikosongkan. Penugasan melalui formulir ini menambah akses. Pencabutan atau pengurangan akses belum tersedia.

Tambah usaha membuat usaha terpisah dengan outlet pertama dan menjadikan akun yang sedang login sebagai owner. Owner lain pada usaha asal tidak otomatis mendapat akses usaha baru. Pemilik dapat memilih laporan outlet aktif atau gabungan seluruh outlet dalam usaha aktif; gabungan tersebut tidak mencakup usaha lain. Tanggal laporan mengikuti tanggal pembukuan masing-masing outlet.

Schema memigrasikan data versi sebelumnya menjadi satu usaha dengan satu outlet, mempertahankan ID dokumen, jurnal, dan saldo. Lokal menerapkannya saat API dimulai ulang. Pada Neon, jalankan kembali `pnpm db:migrate`. Tabel `businesses` dan kolom `business_id` pada dokumen tetap menjadi penanda outlet demi kompatibilitas data; `organizations` mengelompokkan usaha, `organization_owners` menyimpan pemilik, dan `outlet_cashiers` menyimpan penugasan kasir.

## Pengujian

```powershell
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm deploy:check
```

Pengujian transaksi menggunakan PostgreSQL di memori. Pengujian browser menjalankan aplikasi terpisah pada port 5174 dan 8788 dengan database di memori, sehingga data demo utama tidak berubah. Skenario browser mencakup login, shift, checkout, kembalian, penyerahan, laporan, unduhan CSV, semua layar, layout desktop dan ponsel, pembuatan outlet dan usaha, beberapa owner, akses kasir, keranjang terpisah, serta laporan gabungan. Pengujian backend juga memeriksa migrasi data versi satu outlet dan penolakan akses lintas usaha atau outlet. `deploy:check` melakukan pemeriksaan TypeScript, build frontend, dan dry run bundling Worker; perintah ini tidak menerbitkan aplikasi.

## Deployment Cloudflare dan Neon

1. Buat database Neon, lalu salin `.env.example` menjadi `.env` dan isi `DATABASE_URL`. Simpan connection string hanya di file lokal yang diabaikan Git atau secret layanan.
2. Jalankan `pnpm db:migrate`. Skrip memuat `.env`, membuat schema dan ekstensi `pgcrypto`, dan tidak memasukkan akun atau transaksi demo.
3. Login ke Cloudflare dengan `pnpm exec wrangler login`.
4. Jalankan `pnpm exec wrangler secret put DATABASE_URL` dan masukkan connection string Neon pada prompt. Jika diminta membuat Worker, gunakan nama `omzetin`.
5. Tidak perlu `BOOTSTRAP_SECRET`. Pendaftaran owner tersedia untuk publik.
6. Jalankan `pnpm deploy`, lalu buka URL Worker yang diberikan Wrangler.
7. Pilih **Belum punya akun? Daftar**, buat akun owner, bisnis, outlet pertama, dan saldo pembukaan. Setelah berhasil langsung masuk. Setiap pendaftaran membuat bisnis terpisah; email yang sudah terdaftar harus login. Owner yang sudah login menambahkan bisnis dan outlet lewat Pengaturan.
8. Tambahkan bahan, catat pembelian, buat menu dan resep, lalu buka shift untuk mulai bertransaksi.

Password baru memakai bcrypt dengan cost 12 atas digest SHA-256, dikerjakan melalui `pgcrypto` di PostgreSQL. Hal ini memindahkan beban hashing dari CPU Worker. Session cookie menggunakan HttpOnly dan SameSite Strict, serta Secure pada HTTPS. API memeriksa Origin untuk perubahan data. Connection string tidak dikirim ke frontend.

Build Cloudflare sudah diperiksa secara lokal. Pengukuran CPU dan latensi di Cloudflare, koneksi Neon, serta pemulihan backup belum dapat diuji tanpa akun layanan. Paket gratis memiliki batas pemakaian; validasi kuota dan performa pada akun yang dipakai sebelum mengandalkan aplikasi untuk operasional. Rujukan deployment: [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/), [batas Workers](https://developers.cloudflare.com/workers/platform/limits/), dan [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver).

## Batas versi awal

Setiap outlet memiliki satu shift aktif. Owner mengakses seluruh outlet dalam usaha yang dikelolanya; kasir hanya mengakses outlet yang ditugaskan. Isolasi usaha dan outlet diterapkan melalui verifikasi keanggotaan, query berscope outlet, foreign key gabungan pada dokumen terkait, serta pengujian akses lintas usaha dan outlet. Database belum memakai RLS; pemisahan role database untuk migrasi dan runtime masih merupakan pekerjaan sebelum peluncuran SaaS publik.

Pembayaran digital dan pencairan dicatat secara manual. Belum ada gateway, QRIS dinamis, webhook, pencocokan pencairan per transaksi, atau refund digital melalui akun bank setelah clearing dicairkan. Refund penuh tersedia; refund sebagian belum dibuat. Untuk versi ini, alur refund digital membutuhkan saldo clearing yang cukup.

Pembayaran membutuhkan koneksi server. Keranjang disimpan lokal, tetapi belum ada sinkronisasi transaksi offline, antrean outbox, PWA, atau KDS. Laporan adalah laporan manajemen berdasarkan biaya tercatat dan belum mencakup perpajakan, penyusutan, utang atau piutang, serta alokasi overhead produksi. Tampilan riwayat dibatasi pada 200 pesanan, 100 jurnal atau pergerakan, dan 40 audit terakhir; agregat laporan mencakup seluruh jurnal sesuai periode.

Backup otomatis, uji pemulihan, pagination riwayat, pengelolaan sesi dan reset password, pencabutan akses anggota, arsip outlet, transfer stok antaroutlet, serta validasi beban di layanan produksi perlu diselesaikan sebelum penggunaan bisnis yang lebih luas.

## Struktur proyek

```text
src/client/          Antarmuka React dan laporan
src/server/app.ts    API dan otorisasi
src/server/domain.ts Perhitungan desimal, jurnal, stok, tanggal usaha
src/server/schema.ts Schema PostgreSQL dan constraint jurnal
src/server/db.ts     Adapter PGlite dan Neon
src/server/local.ts  API lokal dan data demo
src/server/worker.ts Entry point Cloudflare
scripts/migrate.ts   Pembuatan schema Neon
tests/               Pengujian transaksi dan browser
wrangler.jsonc       Konfigurasi Worker dan static assets
```

Master plan awal berada di `D:/code/private-project/OMZETIN-MASTER-PLAN.md`. Stack implementasi awal menyesuaikan arah Cloudflare dan Neon; fitur lanjutan pada master plan tetap merupakan roadmap.

Pendaftaran dibatasi maksimal 5 percobaan per alamat IP dalam 15 menit. Email belum diverifikasi dan pemulihan password belum tersedia pada versi ini. Secret runtime Cloudflare yang wajib hanya `DATABASE_URL`; secret bootstrap lama dapat dihapus.
