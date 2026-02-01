# Missing constituency data

Constituencies that exist in the schema but are **missing from the election JSON** for that state and year. Similar to previously missing: Aravakurichi & Thanjavur (TN 2016 AC, deferred poll), Vellore PC (TN 2019, countermanded).

**How to regenerate:** run `node scripts/find-missing-constituencies.mjs --doc`

---

## Summary

| Type | Total missing entries | Files with gaps |
|------|------------------------|-----------------|
| Assembly (AC) | 525 | 19 state-year files |
| Parliament (PC) | 21 | 4 state-year files |

---

## Likely deferred / countermanded (1–5 missing per file)

These are the best candidates for adding missing data (e.g. Form 20 / bypolls).

### Assembly (AC)
- **BR 2025** (2 missing): BR-042 Pipra, BR-131 Kalyanpur (SC)
- **GJ 2012** (3 missing): GJ-038 KALOL, GJ-074 JETPUR, GJ-089 MANGROL
- **GJ 2017** (3 missing): GJ-038 KALOL, GJ-074 JETPUR, GJ-089 MANGROL
- **GJ 2022** (3 missing): GJ-038 KALOL, GJ-074 JETPUR, GJ-089 MANGROL
- **OD 2019** (1 missing): OD-096 PATKURA
- **RJ 2018** (1 missing): RJ-067 Ramgarh
- **RJ 2023** (1 missing): RJ-181 Shahpura(SC)
- **TN 2011** (2 missing): TN-050 Tiruppattur, TN-140 Tiruchirappalli West
- **TN 2016** (2 missing): TN-050 Tiruppattur, TN-140 Tiruchirappalli West
- **TS 2023** (1 missing): TS-017 Nizamabad (Urban)
- **WB 2011** (1 missing): WB-146 BISHNUPUR (SC)
- **WB 2016** (1 missing): WB-146 BISHNUPUR (SC)
- **WB 2021** (1 missing): WB-146 BISHNUPUR (SC)

### Parliament (PC)
- **AS 2024** (3 missing): AS-02 Dhubri, AS-05 Gauhati, AS-12 Lakhimpur

---

## Full list: Assembly (AC)

### AP 2009

- Expected: 132 | In file: 136 | Missing: 114

- AP-151 Yelamanchili
- AP-155 Prathipadu
- AP-159 Anaparthy
- AP-176 Palacole
- AP-177 Narasapuram
- AP-178 Bhimavaram
- AP-179 Undi
- AP-180 Tanuku
- AP-181 Tadepalligudem
- AP-182 Ungutur
- AP-183 Denduluru
- AP-184 Eluru
- AP-185 Gopalapuram (SC)
- AP-187 Chintalapudi (SC)
- AP-188 Tiruvuru (SC)
- AP-189 Nuzvid
- AP-190 Gannavaram
- AP-191 Gudivada
- AP-192 Kaikalur
- AP-193 Pedana
- AP-194 Machilipatnam
- AP-195 Avanigadda
- AP-196 Pamarru (SC)
- AP-197 Penamaluru
- AP-200 Vijayawada East
- AP-202 Nandigama (SC)
- AP-203 Jaggayyapeta
- AP-205 Tadikonda (SC)
- AP-206 Mangalagiri
- AP-207 Ponnur
- AP-208 Vemuru (SC)
- AP-209 Repalle
- AP-210 Tenali
- AP-211 Bapatla
- AP-212 Prathipadu (SC)
- AP-213 Guntur West
- AP-214 Guntur East
- AP-215 Chilakaluripet
- AP-216 Narasaraopet
- AP-218 Vinukonda
- AP-220 Macherla
- AP-221 Yerragondapalem (SC)
- AP-222 Darsi
- AP-223 Parchur
- AP-224 Addanki
- AP-225 Chirala
- AP-226 Santhanuthalapadu (SC)
- AP-227 Ongole
- AP-228 Kandukur
- AP-229 Kondapi (SC)
- AP-230 Markapuram
- AP-231 Giddalur
- AP-232 Kanigiri
- AP-233 Kavali
- AP-234 Atmakur
- AP-235 Kovur
- AP-236 Nellore City
- AP-237 Nellore Rural
- AP-238 Sarvepalli
- AP-239 Gudur (SC)
- AP-240 Sullurpeta (SC)
- AP-241 Venkatagiri
- AP-242 Udayagiri
- AP-243 Badvel (SC)
- AP-244 Rajampet
- AP-245 Kadapa
- AP-246 Kodur (SC)
- AP-247 Rayachoti
- AP-248 Pulivendla
- AP-249 Kamalapuram
- AP-250 Jammalamadugu
- AP-251 Proddatur
- AP-252 Mydukur
- AP-253 Allagadda
- AP-254 Srisailam
- AP-255 Nandikotkur (SC)
- AP-256 Kurnool
- AP-257 Panyam
- AP-258 Nandyal
- AP-259 Banaganapalle
- AP-260 Dhone
- AP-261 Pattikonda
- AP-262 Kodumur (SC)
- AP-263 Yemmiganur
- AP-264 Mantralayam
- AP-265 Adoni
- AP-266 Alur
- AP-267 Rayadurg
- AP-268 Uravakonda
- AP-269 Guntakal
- AP-271 Singanamala (SC)
- AP-272 Anantapur Urban
- AP-273 Kalyandurg
- AP-274 Raptadu
- AP-275 Madakasira (SC)
- AP-276 Hindupur
- AP-277 Penukonda
- AP-278 Puttaparthi
- AP-279 Dharmavaram
- AP-280 Kadiri
- AP-281 Thamballapalle
- AP-282 Pileru
- AP-283 Madanapalle
- AP-284 Punganur
- AP-285 Chandragiri
- AP-286 Tirupati
- AP-287 Srikalahasti
- AP-288 Satyavedu (SC)
- AP-289 Nagari
- AP-290 Gangadhara Nellore (SC)
- AP-291 Chittoor
- AP-292 Puthalapattu (SC)
- AP-293 Palamaner
- AP-294 Kuppam

### AP 2014

- Expected: 132 | In file: 124 | Missing: 113

- AP-155 Prathipadu
- AP-159 Anaparthy
- AP-176 Palacole
- AP-177 Narasapuram
- AP-178 Bhimavaram
- AP-179 Undi
- AP-180 Tanuku
- AP-181 Tadepalligudem
- AP-182 Ungutur
- AP-183 Denduluru
- AP-184 Eluru
- AP-185 Gopalapuram (SC)
- AP-187 Chintalapudi (SC)
- AP-188 Tiruvuru (SC)
- AP-189 Nuzvid
- AP-190 Gannavaram
- AP-191 Gudivada
- AP-192 Kaikalur
- AP-193 Pedana
- AP-194 Machilipatnam
- AP-195 Avanigadda
- AP-196 Pamarru (SC)
- AP-197 Penamaluru
- AP-200 Vijayawada East
- AP-202 Nandigama (SC)
- AP-203 Jaggayyapeta
- AP-205 Tadikonda (SC)
- AP-206 Mangalagiri
- AP-207 Ponnur
- AP-208 Vemuru (SC)
- AP-209 Repalle
- AP-210 Tenali
- AP-211 Bapatla
- AP-212 Prathipadu (SC)
- AP-213 Guntur West
- AP-214 Guntur East
- AP-215 Chilakaluripet
- AP-216 Narasaraopet
- AP-218 Vinukonda
- AP-220 Macherla
- AP-221 Yerragondapalem (SC)
- AP-222 Darsi
- AP-223 Parchur
- AP-224 Addanki
- AP-225 Chirala
- AP-226 Santhanuthalapadu (SC)
- AP-227 Ongole
- AP-228 Kandukur
- AP-229 Kondapi (SC)
- AP-230 Markapuram
- AP-231 Giddalur
- AP-232 Kanigiri
- AP-233 Kavali
- AP-234 Atmakur
- AP-235 Kovur
- AP-236 Nellore City
- AP-237 Nellore Rural
- AP-238 Sarvepalli
- AP-239 Gudur (SC)
- AP-240 Sullurpeta (SC)
- AP-241 Venkatagiri
- AP-242 Udayagiri
- AP-243 Badvel (SC)
- AP-244 Rajampet
- AP-245 Kadapa
- AP-246 Kodur (SC)
- AP-247 Rayachoti
- AP-248 Pulivendla
- AP-249 Kamalapuram
- AP-250 Jammalamadugu
- AP-251 Proddatur
- AP-252 Mydukur
- AP-253 Allagadda
- AP-254 Srisailam
- AP-255 Nandikotkur (SC)
- AP-256 Kurnool
- AP-257 Panyam
- AP-258 Nandyal
- AP-259 Banaganapalle
- AP-260 Dhone
- AP-261 Pattikonda
- AP-262 Kodumur (SC)
- AP-263 Yemmiganur
- AP-264 Mantralayam
- AP-265 Adoni
- AP-266 Alur
- AP-267 Rayadurg
- AP-268 Uravakonda
- AP-269 Guntakal
- AP-271 Singanamala (SC)
- AP-272 Anantapur Urban
- AP-273 Kalyandurg
- AP-274 Raptadu
- AP-275 Madakasira (SC)
- AP-276 Hindupur
- AP-277 Penukonda
- AP-278 Puttaparthi
- AP-279 Dharmavaram
- AP-280 Kadiri
- AP-281 Thamballapalle
- AP-282 Pileru
- AP-283 Madanapalle
- AP-284 Punganur
- AP-285 Chandragiri
- AP-286 Tirupati
- AP-287 Srikalahasti
- AP-288 Satyavedu (SC)
- AP-289 Nagari
- AP-290 Gangadhara Nellore (SC)
- AP-291 Chittoor
- AP-292 Puthalapattu (SC)
- AP-293 Palamaner
- AP-294 Kuppam

### AP 2019

- Expected: 132 | In file: 125 | Missing: 113

- AP-155 Prathipadu
- AP-159 Anaparthy
- AP-176 Palacole
- AP-177 Narasapuram
- AP-178 Bhimavaram
- AP-179 Undi
- AP-180 Tanuku
- AP-181 Tadepalligudem
- AP-182 Ungutur
- AP-183 Denduluru
- AP-184 Eluru
- AP-185 Gopalapuram (SC)
- AP-187 Chintalapudi (SC)
- AP-188 Tiruvuru (SC)
- AP-189 Nuzvid
- AP-190 Gannavaram
- AP-191 Gudivada
- AP-192 Kaikalur
- AP-193 Pedana
- AP-194 Machilipatnam
- AP-195 Avanigadda
- AP-196 Pamarru (SC)
- AP-197 Penamaluru
- AP-200 Vijayawada East
- AP-202 Nandigama (SC)
- AP-203 Jaggayyapeta
- AP-205 Tadikonda (SC)
- AP-206 Mangalagiri
- AP-207 Ponnur
- AP-208 Vemuru (SC)
- AP-209 Repalle
- AP-210 Tenali
- AP-211 Bapatla
- AP-212 Prathipadu (SC)
- AP-213 Guntur West
- AP-214 Guntur East
- AP-215 Chilakaluripet
- AP-216 Narasaraopet
- AP-218 Vinukonda
- AP-220 Macherla
- AP-221 Yerragondapalem (SC)
- AP-222 Darsi
- AP-223 Parchur
- AP-224 Addanki
- AP-225 Chirala
- AP-226 Santhanuthalapadu (SC)
- AP-227 Ongole
- AP-228 Kandukur
- AP-229 Kondapi (SC)
- AP-230 Markapuram
- AP-231 Giddalur
- AP-232 Kanigiri
- AP-233 Kavali
- AP-234 Atmakur
- AP-235 Kovur
- AP-236 Nellore City
- AP-237 Nellore Rural
- AP-238 Sarvepalli
- AP-239 Gudur (SC)
- AP-240 Sullurpeta (SC)
- AP-241 Venkatagiri
- AP-242 Udayagiri
- AP-243 Badvel (SC)
- AP-244 Rajampet
- AP-245 Kadapa
- AP-246 Kodur (SC)
- AP-247 Rayachoti
- AP-248 Pulivendla
- AP-249 Kamalapuram
- AP-250 Jammalamadugu
- AP-251 Proddatur
- AP-252 Mydukur
- AP-253 Allagadda
- AP-254 Srisailam
- AP-255 Nandikotkur (SC)
- AP-256 Kurnool
- AP-257 Panyam
- AP-258 Nandyal
- AP-259 Banaganapalle
- AP-260 Dhone
- AP-261 Pattikonda
- AP-262 Kodumur (SC)
- AP-263 Yemmiganur
- AP-264 Mantralayam
- AP-265 Adoni
- AP-266 Alur
- AP-267 Rayadurg
- AP-268 Uravakonda
- AP-269 Guntakal
- AP-271 Singanamala (SC)
- AP-272 Anantapur Urban
- AP-273 Kalyandurg
- AP-274 Raptadu
- AP-275 Madakasira (SC)
- AP-276 Hindupur
- AP-277 Penukonda
- AP-278 Puttaparthi
- AP-279 Dharmavaram
- AP-280 Kadiri
- AP-281 Thamballapalle
- AP-282 Pileru
- AP-283 Madanapalle
- AP-284 Punganur
- AP-285 Chandragiri
- AP-286 Tirupati
- AP-287 Srikalahasti
- AP-288 Satyavedu (SC)
- AP-289 Nagari
- AP-290 Gangadhara Nellore (SC)
- AP-291 Chittoor
- AP-292 Puthalapattu (SC)
- AP-293 Palamaner
- AP-294 Kuppam

### AP 2024

- Expected: 132 | In file: 126 | Missing: 113

- AP-155 Prathipadu
- AP-159 Anaparthy
- AP-176 Palacole
- AP-177 Narasapuram
- AP-178 Bhimavaram
- AP-179 Undi
- AP-180 Tanuku
- AP-181 Tadepalligudem
- AP-182 Ungutur
- AP-183 Denduluru
- AP-184 Eluru
- AP-185 Gopalapuram (SC)
- AP-187 Chintalapudi (SC)
- AP-188 Tiruvuru (SC)
- AP-189 Nuzvid
- AP-190 Gannavaram
- AP-191 Gudivada
- AP-192 Kaikalur
- AP-193 Pedana
- AP-194 Machilipatnam
- AP-195 Avanigadda
- AP-196 Pamarru (SC)
- AP-197 Penamaluru
- AP-200 Vijayawada East
- AP-202 Nandigama (SC)
- AP-203 Jaggayyapeta
- AP-205 Tadikonda (SC)
- AP-206 Mangalagiri
- AP-207 Ponnur
- AP-208 Vemuru (SC)
- AP-209 Repalle
- AP-210 Tenali
- AP-211 Bapatla
- AP-212 Prathipadu (SC)
- AP-213 Guntur West
- AP-214 Guntur East
- AP-215 Chilakaluripet
- AP-216 Narasaraopet
- AP-218 Vinukonda
- AP-220 Macherla
- AP-221 Yerragondapalem (SC)
- AP-222 Darsi
- AP-223 Parchur
- AP-224 Addanki
- AP-225 Chirala
- AP-226 Santhanuthalapadu (SC)
- AP-227 Ongole
- AP-228 Kandukur
- AP-229 Kondapi (SC)
- AP-230 Markapuram
- AP-231 Giddalur
- AP-232 Kanigiri
- AP-233 Kavali
- AP-234 Atmakur
- AP-235 Kovur
- AP-236 Nellore City
- AP-237 Nellore Rural
- AP-238 Sarvepalli
- AP-239 Gudur (SC)
- AP-240 Sullurpeta (SC)
- AP-241 Venkatagiri
- AP-242 Udayagiri
- AP-243 Badvel (SC)
- AP-244 Rajampet
- AP-245 Kadapa
- AP-246 Kodur (SC)
- AP-247 Rayachoti
- AP-248 Pulivendla
- AP-249 Kamalapuram
- AP-250 Jammalamadugu
- AP-251 Proddatur
- AP-252 Mydukur
- AP-253 Allagadda
- AP-254 Srisailam
- AP-255 Nandikotkur (SC)
- AP-256 Kurnool
- AP-257 Panyam
- AP-258 Nandyal
- AP-259 Banaganapalle
- AP-260 Dhone
- AP-261 Pattikonda
- AP-262 Kodumur (SC)
- AP-263 Yemmiganur
- AP-264 Mantralayam
- AP-265 Adoni
- AP-266 Alur
- AP-267 Rayadurg
- AP-268 Uravakonda
- AP-269 Guntakal
- AP-271 Singanamala (SC)
- AP-272 Anantapur Urban
- AP-273 Kalyandurg
- AP-274 Raptadu
- AP-275 Madakasira (SC)
- AP-276 Hindupur
- AP-277 Penukonda
- AP-278 Puttaparthi
- AP-279 Dharmavaram
- AP-280 Kadiri
- AP-281 Thamballapalle
- AP-282 Pileru
- AP-283 Madanapalle
- AP-284 Punganur
- AP-285 Chandragiri
- AP-286 Tirupati
- AP-287 Srikalahasti
- AP-288 Satyavedu (SC)
- AP-289 Nagari
- AP-290 Gangadhara Nellore (SC)
- AP-291 Chittoor
- AP-292 Puthalapattu (SC)
- AP-293 Palamaner
- AP-294 Kuppam

### BR 2025

- Expected: 243 | In file: 241 | Missing: 2

- BR-042 Pipra
- BR-131 Kalyanpur (SC)

### GJ 2012

- Expected: 182 | In file: 179 | Missing: 3

- GJ-038 KALOL
- GJ-074 JETPUR
- GJ-089 MANGROL

### GJ 2017

- Expected: 182 | In file: 179 | Missing: 3

- GJ-038 KALOL
- GJ-074 JETPUR
- GJ-089 MANGROL

### GJ 2022

- Expected: 182 | In file: 179 | Missing: 3

- GJ-038 KALOL
- GJ-074 JETPUR
- GJ-089 MANGROL

### JK 2008

- Expected: 90 | In file: 87 | Missing: 25

- JK-088 Surankote
- JK-089 Poonch Haveli
- JK-090 Mendhar
- JK-091 Channapora
- JK-092 Central Shalteng
- JK-093 Chrar-i-Sharief
- JK-094 Zainapora
- JK-095 D.H. Pora
- JK-096 Anantnag West
- JK-097 Srigufwara - Bijbehara
- JK-098 Shangus - Anantnag East
- JK-099 Padder-Nagseni
- JK-100 Bhadarwah
- JK-101 Doda West
- JK-102 Shri Mata Vaishno Devi
- JK-103 Udhampur West
- JK-104 Udhampur East
- JK-105 Jasrota
- JK-106 Ramgarh
- JK-107 R.S. Pura - Jammu South
- JK-108 Bahu
- JK-109 Jammu North
- JK-110 Kalakote - Sunderbani
- JK-111 Budhal
- JK-112 Thannamandi

### JK 2014

- Expected: 90 | In file: 87 | Missing: 25

- JK-088 Surankote
- JK-089 Poonch Haveli
- JK-090 Mendhar
- JK-091 Channapora
- JK-092 Central Shalteng
- JK-093 Chrar-i-Sharief
- JK-094 Zainapora
- JK-095 D.H. Pora
- JK-096 Anantnag West
- JK-097 Srigufwara - Bijbehara
- JK-098 Shangus - Anantnag East
- JK-099 Padder-Nagseni
- JK-100 Bhadarwah
- JK-101 Doda West
- JK-102 Shri Mata Vaishno Devi
- JK-103 Udhampur West
- JK-104 Udhampur East
- JK-105 Jasrota
- JK-106 Ramgarh
- JK-107 R.S. Pura - Jammu South
- JK-108 Bahu
- JK-109 Jammu North
- JK-110 Kalakote - Sunderbani
- JK-111 Budhal
- JK-112 Thannamandi

### OD 2019

- Expected: 147 | In file: 146 | Missing: 1

- OD-096 PATKURA

### RJ 2018

- Expected: 200 | In file: 199 | Missing: 1

- RJ-067 Ramgarh

### RJ 2023

- Expected: 200 | In file: 199 | Missing: 1

- RJ-181 Shahpura(SC)

### TN 2011

- Expected: 234 | In file: 232 | Missing: 2

- TN-050 Tiruppattur
- TN-140 Tiruchirappalli West

### TN 2016

- Expected: 234 | In file: 232 | Missing: 2

- TN-050 Tiruppattur
- TN-140 Tiruchirappalli West

### TS 2023

- Expected: 119 | In file: 118 | Missing: 1

- TS-017 Nizamabad (Urban)

### WB 2011

- Expected: 294 | In file: 293 | Missing: 1

- WB-146 BISHNUPUR (SC)

### WB 2016

- Expected: 294 | In file: 293 | Missing: 1

- WB-146 BISHNUPUR (SC)

### WB 2021

- Expected: 294 | In file: 293 | Missing: 1

- WB-146 BISHNUPUR (SC)

---

## Full list: Parliament (PC)

### AS 2009

- Expected: 12 | In file: 8 | Missing: 6

- AS-04 Darrang Udalguri (ex Mangaldoi)
- AS-05 Gauhati
- AS-06 Diphu (ex Autonomous District)
- AS-07 Karimganj
- AS-08 Silchar
- AS-14 Jorhat

### AS 2014

- Expected: 12 | In file: 8 | Missing: 6

- AS-04 Darrang Udalguri (ex Mangaldoi)
- AS-05 Gauhati
- AS-06 Diphu (ex Autonomous District)
- AS-07 Karimganj
- AS-08 Silchar
- AS-14 Jorhat

### AS 2019

- Expected: 12 | In file: 8 | Missing: 6

- AS-04 Darrang Udalguri (ex Mangaldoi)
- AS-05 Gauhati
- AS-06 Diphu (ex Autonomous District)
- AS-07 Karimganj
- AS-08 Silchar
- AS-14 Jorhat

### AS 2024

- Expected: 12 | In file: 9 | Missing: 3

- AS-02 Dhubri
- AS-05 Gauhati
- AS-12 Lakhimpur

---

*Generated by `scripts/find-missing-constituencies.mjs --doc`*