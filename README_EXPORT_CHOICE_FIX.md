# Dizin App Export Choice Fix

Bu paket şu düzeltmeleri içerir:

- İndir butonu artık direkt PDF indirmez; önce seçim modalı açar.
- Modalda PDF, Word (.docx) ve karşılaştırmalı PDF seçenekleri görünür.
- Karşılaştırmalı PDF, ilk verilen dizin ile son düzeltilmiş dizini yan yana üretir.
- Review ekranının üst barına da aynı indirme butonu eklenmiştir.
- Backend PDF üretimi WeasyPrint gerektirmez; reportlab/python-docx ile çalışır.

Kurulum repo kökünden yapılmalıdır.
