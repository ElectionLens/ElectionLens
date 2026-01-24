#!/usr/bin/env python3
"""Import manually extracted CSV data for AC081."""

import json
import csv
import io
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")

csv_data = """Station No,Station Name,Electors,C1: Kamalakannan,C2: Palaniyammal,C3: Balakrishnan,C4: Rajamanickam,C5: Malaiyarasan,C6: Venkatraman,C7: Subramanian,C8: Mayilamparai,C9: Kumaraguru (AIADMK),C10: Kumaraguru (PMK),C11: Iniyan,C12: Jagadesan,C13: Jeevanraj,C14: Devadass,C15: Jayabal,C16: Prabu,C17: Arul,C18: Ramasamy,C19: Mari,C20: R.K,C21: M,C22: C,C23: S,NOTA,Total Valid Votes,Tendered Votes
1,Govt Higher Sec School Siruvachur Facing West North Wing,958,2,29,26,1,385,3,0,0,291,0,0,0,0,0,15,0,0,0,0,0,1,17,0,1,770,0
2,Govt Higher Sec School Siruvachur Middle Wing Ground Floor,824,2,0,1,3,306,5,0,3,247,0,306,58,674,672,45,0,0,0,0,0,2,2,2,2,674,0
3,Govt Higher Sec School Siruvachur (SSA) North Middle Wing,552,0,76,15,467,463,150,0,0,0,0,0,4,216,0,0,0,2,1,1,2,0,0,0,1,467,0
4,Panchayat Union Elementary School Siruvachur South Wing,987,7,317,0,238,102,0,0,732,5,1,0,0,0,7,102,52,1,0,1,1,2,1,2,1,727,0
5,Govt Higher Sec School Siruvachur (SSA) North West Wing,681,4,205,0,1,216,0,0,0,0,0,76,0,0,0,4,519,0,216,0,0,0,0,0,1,515,0
6,Govt Higher Sec School Siruvachur East Facing North East wing,813,1,80,241,318,677,0,1,0,1,0,4,1,0,0,27,0,0,0,0,0,1,2,0,0,679,0
7,Govt Higher Sec School Siruvachur Nabard South West Wing,706,2,76,185,556,245,4,38,1,557,1,0,0,1,0,0,0,1,1,0,1,1,1,0,1,556,0
8,Govt Higher Sec School Siruvachur North West wing,593,0,24,477,0,248,0,471,0,6,0,248,96,3,0,0,0,7,0,0,0,0,0,0,1,477,0
9,Panchayat Union Elementary School Siruvachur North Facing,1048,0,4,0,0,324,0,0,324,356,0,4,163,900,5,0,895,1,0,8,1,0,2,3,27,900,0
10,Govt Higher Sec School Siruvachur East Facing North West Wing,526,2,0,0,0,213,0,433,213,134,56,0,2,1,0,0,1,0,0,0,0,21,0,0,2,431,0
11,Govt Higher Sec School Siruvachur East Facing North East Wing,695,1,0,0,0,284,41,0,0,1,0,547,0,0,553,1,1,0,0,0,0,0,0,0,6,553,0
12,Panchayat Union Middle School Veppanatham North Eastwing,921,1,126,4,0,311,0,0,0,1,2,1,801,0,0,3,0,4,24,1,3,311,797,0,0,801,0
13,Panchayat Union Middle School Veppanatham North Westwing,864,2,693,0,5,226,0,0,0,2,349,226,65,0,0,0,0,3,0,0,42,0,1,2,3,698,0
14,Panchayat Union Elementary School Unathur South East Wing,1097,3,835,0,7,377,4,0,3,2,37,0,2,3,162,377,0,0,0,832,3,3,1,1,1,835,0
15,Panchayat Union Elementary School Unathur South West Wing,824,2,29,2,0,254,0,0,2,149,254,2,112,723,46,1,1,1,1,0,575,0,29,575,0,575,0
16,Panchayat Union Elementary School Unathur West South Wing,605,0,0,0,0,252,0,0,605,1,59,117,1,30,0,252,1,1,1,1,3,1,9,2,1,468,0
17,Panchayat Union Elementary School Unathur (SSA) West North Wing,1276,4,235,81,1,419,263,4,0,8,0,1,3,0,1,1,472,1037,0,0,4,468,0,1031,6,1037,0
18,Panchayat Union Elementary School Unathur (SSA) West South Wing,598,2,36,191,0,224,4,0,2,0,29,224,1,1,2,1,0,493,0,7,500,0,0,0,7,500,0
19,Panchayat Union Elementary School varagur South East wing,1035,0,2,442,0,280,0,0,41,3,1,0,280,0,2,0,1,0,0,1,1,1,0,4,4,856,0
20,Panchayat Union Elementary School Varagur Terreced West,1210,4,159,0,490,267,0,34,1,1,2,1,0,0,0,7,0,0,267,7,2,3,978,0,12,990,0
21,Government High School Puthur North Middle Wing,929,1,1,308,0,272,1,0,0,3,87,1,272,0,0,0,0,1,1,1,1,6,1,0,4,733,0
22,Government High School Puthur North west Wing,604,0,161,101,0,0,33,0,0,2,0,2,0,0,1,0,0,1,1,2,0,604,0,2,2,492,0
23,Government High School Puthur South East Wing,1068,1,0,0,112,236,0,0,66,1,3,1,3,236,5,7,0,0,0,0,0,1,0,1,0,911,0
24,Panchayat Union Elementary School Navakurichi (SSA) North West Wing,1241,0,532,1241,0,392,0,0,2,1,0,65,30,1,1,2,0,0,2,0,0,1083,392,0,5,897,0
25,Panchayat Union Elementary School Navakurichi Tiled South West Wing,1083,0,409,0,0,359,15,0,3,0,0,0,0,0,0,0,0,4,2,1,1,777,359,0,2,887,0
26,Panchayat Union Elementary School Navakurichi (SSA) North Middle Wing,777,2,0,0,0,213,0,2,0,0,0,2,0,1,0,1,0,0,30,0,0,0,213,0,0,609,0
27,Panchayat Union Elementary School Navakurichi Tiled south East Wing,796,2,321,0,0,280,0,1,38,2,0,0,7,2,2,4,280,0,1,0,1,1,3,0,1,666,0
28,Panchayat Union Middle School Pattuthurai (SSA) North facing West wing,1146,1,0,67,19,372,480,0,0,0,372,1,0,0,1,1,2,0,2,4,1,0,950,0,9,959,0
29,Panchayat Union Middle School Pattuthurai (SSA) North facing Middle wing,1109,2,35,0,58,153,2,0,0,337,2,0,1,0,0,5,2,0,0,0,2,1,1,153,0,865,0
30,Panchayat Union Elementary School Manivilundan South East North Wing,979,2,249,1,2,313,2,2,57,2,2,0,1,0,0,0,1,1,2,2,861,0,4,792,13,805,0
31,Panchayat Union Elementary School Manivilundan South East South Wing,835,0,0,32,835,269,255,0,0,41,0,0,0,0,0,1,0,1,0,1,1,2,2,605,4,609,0
32,Panchayat Union Elementary School Manivilundan North East South Wing,1041,3,0,0,2,477,2,0,0,0,5,0,0,477,256,4,67,852,39,1,29,857,8,30,0,852,0
33,Panchayat Union Middle School Manivilunthan North East North Wing,746,1,0,0,0,276,4,46,594,214,276,2,5,42,1,0,0,1,1,1,605,0,0,0,0,605,0
34,Panchayat Union Middle School Manivilunthan North East south Wing,773,1,5,2,2,219,0,1,262,559,0,29,5,0,0,0,1,1,1,0,219,32,1,2,1,564,0
35,Panchayat Union Middle School Manivilunthan North West North Wing,794,3,2,8,634,254,1,254,79,239,4,0,47,0,0,0,0,1,564,642,0,0,0,0,0,642,0
36,Panchayat Union Middle School Manivilunthan North west middle portion,709,3,12,594,2,226,0,0,0,0,3,2,115,3,0,0,4,0,2,0,226,32,1,1,2,598,0
37,Panchayat Union Elementary School Ex Servicemen Colony East North Wing,1181,1,2,74,422,273,71,8,0,3,0,0,1,0,0,0,273,1,0,0,4,0,1,3,1,865,0
38,Panchayat Union Elementary School Ex Servicemen Colony East Southern Wing,882,1,664,236,14,221,0,27,1,1,5,3,0,3,1,221,1,0,0,1,2,1,678,0,0,678,0
39,Panchayat Union Middle School Muttal-Poomarathupatti East South Wing,491,2,444,0,40,220,0,150,1,0,0,2,2,0,0,1,0,0,1,0,220,4,2,4,1,446,0
40,Panchayat Union Elementary School (East) Kattukottai East South Wing,1089,1,347,406,2,74,3,0,0,1,8,5,74,0,4,0,2,0,1,1,1,1,1,1,1,859,0
41,Panchayat Union Elementary School Kattukottai Tiled East south Wing,606,0,0,4,0,239,0,460,1,147,0,0,0,0,0,39,0,2,1,27,1,0,1,2,0,464,0
42,Panchayat Union Elementary School Kattukottai North West Wing,686,1,0,0,525,228,36,3,0,0,0,0,1,47,0,5,228,0,1,0,0,0,206,1,1,530,0
43,Panchayat Union Elementary School Kattukottai North East Wing,660,1,209,35,0,242,0,517,0,242,3,1,0,25,0,0,0,0,1,0,0,0,0,8,0,525,0
44,Panchayat Union Elementary School Kattukottai Pudur Tile South facing West wing,994,1,365,3,350,365,0,807,20,59,0,0,0,0,0,2,7,0,0,0,0,1,1,0,1,810,0
45,Govt Higher Sec School Kattukottai North West Wing,474,2,0,0,320,127,0,1,0,0,0,127,0,0,0,145,0,1,0,2,0,21,0,2,6,326,0
46,Govt Higher Sec School Kattukottai North middle wing,970,1,0,664,0,260,2,1,287,2,3,4,0,29,0,260,0,0,1,3,1,1,0,1,8,672,0
47,Panchayat Union Elementary School Kattukottai Pudur South Facing East Wing,1169,2,309,363,819,103,0,31,0,0,0,1,0,0,0,5,2,0,1,0,0,0,2,0,9,828,0
48,Panchayat Union Elementary School Ayarpadi Tiled North West Wing,910,0,0,63,245,322,1,0,2,43,2,0,0,1,0,1,2,1,0,1,322,7,2,3,1,697,0
49,Panchayat Union Elementary School Thenutruvari South Eastern Wing,1335,4,2,0,0,434,0,0,4,0,434,396,0,49,75,0,0,0,0,0,0,0,0,0,8,971,0
50,Panchayat Union Elementary School Sadhasivapuram Tiled North West Wing,713,2,2,0,0,131,2,2,4,259,33,0,1,1,131,159,1,1,5,1,1,1,0,2,2,602,0
51,Panchayat Union Elementary School Sadhasivapuram Tiled North East Wing,610,1,0,3,209,172,0,28,0,0,0,88,1,172,0,1,1,1,126,79,3,0,1,1,206,510,0
52,Panchayat Union Elementary School Sadhasivapuram Terreced East North Wing,854,2,1,269,0,79,0,0,0,1,1,2,4,0,0,0,0,0,0,0,0,0,0,0,1,696,0
53,Panchayat Union Elementary School Sadhasivapuram Terreced East South Wing,557,2,213,26,0,205,2,0,0,0,0,0,0,0,0,1,2,0,3,3,2,32,0,0,0,493,0
54,Panchayat Union Elementary School Sarvaipudhur (SSA) East North Wing,573,0,0,225,124,124,1,82,5,1,0,12,0,0,0,0,0,0,1,1,0,1,0,0,5,458,0
55,Panchayat Union Elementary School Sarvaipudhur (SSA) East south Wing,608,1,194,159,4,31,0,1,0,89,1,0,0,0,1,2,0,0,4,1,1,99,0,0,0,492,0
56,Panchayat Union Elementary School Sarvaipudhur East middle Wing,588,0,0,0,0,125,0,0,0,24,125,3,0,0,260,0,0,0,2,4,513,0,2,0,0,515,0
57,Panchayat Union Elementary School Sarvaipudhur SSA East South Wing,828,1,205,1,83,230,2,2,0,0,0,0,0,0,3,0,1,1,0,0,230,1,0,0,38,573,0
58,Govt Higher Sec School Deviyakurichi (SSA) North East Wing,861,0,192,0,0,414,0,0,5,0,46,1,0,0,0,1,0,26,0,1,2,0,0,0,0,693,0
59,Govt Higher Sec School Deviyakurichi SSATerreed North Middle Wing,630,2,0,3,0,263,0,0,220,0,0,20,0,0,28,0,1,1,0,0,0,1,2,0,7,546,0
60,Govt Higher Sec School Deviyakurichi South East Wing,895,2,423,0,0,244,1,244,0,3,7,1,0,0,52,1,0,0,0,1,2,2,0,0,6,743,0
61,Govt Higher Sec School Deviyakurichi SSA South Middle Wing,796,1,312,2,0,254,0,0,0,21,1,0,1,46,0,0,0,0,1,1,1,1,1,0,0,647,0
62,Government Rehabilitation Home Deviyakurichi West East Wing,49,0,0,0,31,10,0,0,0,0,0,0,0,10,0,3,0,0,1,0,0,0,0,0,0,45,0
63,Panchayat Union Elementary School Talaivasal (SSA) South Western Wing,1260,1,0,356,431,39,0,1,0,1,65,0,0,0,1,0,0,2,2,1,2,1,1,12,12,915,0
64,Panchayat Union Elementary School Talaivasal (SSA) South Middle Wing,724,0,0,1,0,123,48,0,29,356,0,0,0,0,0,0,0,0,4,0,2,0,0,0,8,571,0
65,Panchayat Union Elementary School Talaivasal (SSA) South East Wing,675,1,37,0,360,139,0,0,1,0,1,0,0,1,0,0,0,1,0,0,8,0,1,0,4,553,0
66,Panchayat Union Middle School Nathakkarai North west Wing,956,2,2,0,0,405,0,2,1,0,405,16,0,1,1,1,322,82,1,1,0,2,3,7,7,842,0
67,Panchayat Union Middle School Nathakkarai South,691,0,0,0,0,267,0,0,0,0,0,267,233,0,14,1,38,0,2,4,0,0,0,29,30,562,0
68,Govt Boys Higher Sec School Mummudi Thalaivasal (SSA) North East Wing,1363,1,385,382,45,342,1,1,0,0,1,1,0,2,1,1,2,414,36,3,88,342,4,11,11,900,0
69,Govt Boys Higher Sec School Mummudi Thalaivasal (SSA) North West Wing,1214,1,0,0,0,231,1,0,0,1,1,231,0,0,0,1,0,1,0,0,1,0,0,0,8,901,0
70,Panchayat Union Middle School Periyeri East Tiled Building Facing South,700,2,168,0,117,33,1,0,0,2,33,0,0,0,0,0,0,0,0,0,0,0,0,3,3,558,0
71,Panchayat Union Middle School Periyeri (SSA) North East Wing,785,1,128,0,115,296,0,4,0,0,1,0,0,0,0,44,0,1,1,2,1,3,1,0,2,599,0
72,Panchayat Union Middle School Periyari Colony St North middle Wing,1103,1,2,2,10,319,409,1,319,0,0,1,73,0,2,42,0,0,0,2,0,1,1,11,11,878,0
73,Panchayat Union Middle School Periyari Colony St South Facing West Wing,1036,2,72,0,0,344,0,347,344,2,1,2,0,2,0,1,3,0,0,1,0,3,2,59,6,843,0
74,Govt Higher Sec School Aragalur North East Wing,1277,2,371,35,0,387,0,2,16,0,0,0,0,0,0,0,0,1,0,0,2,0,0,0,8,825,0
75,Govt Higher Sec School Aragalur North West Wing,847,0,0,50,0,222,0,0,0,0,0,0,0,0,222,241,0,0,2,1,27,2,1,0,9,555,0
76,Panchayat Union Elementary School Aragalur East North Wing,967,1,1,229,0,414,2,14,0,0,0,1,0,60,0,0,0,0,0,0,1,1,1,0,6,730,0
77,Panchayat Union Elementary School Thiyaganur Tiled North East Wing,1050,1,393,0,0,370,1,0,1,2,0,0,55,1,3,0,1,0,0,6,1,0,1,0,8,843,0
78,Panchayat Union Elementary School Thiyaganur Pudur North west Wing,1006,1,54,4,398,334,0,3,0,29,1,2,1,0,1,0,0,0,0,2,1,1,0,8,8,840,0
79,Panchayat Union Elementary School Arathi Agraharam West North Wing,1069,1,2,27,0,438,304,79,1,4,0,0,1,1,0,1,1,2,8,1,1,1,438,6,6,878,0
80,Panchayat Union Elementary School Kamakka Palayam West North Wing,593,1,0,13,0,195,2,2,0,0,32,0,0,0,0,2,0,0,195,0,1,1,1,215,4,468,0
81,Panchayat Union Elementary School Kamakka Palayam West Facing South Wing,704,6,230,1,0,306,27,1,0,0,0,306,1,0,0,0,3,0,0,1,0,0,6,0,0,576,0
82,Panchayat Union Middle School Vedhanayagapuram North west Wing,876,5,0,0,260,412,0,10,0,0,0,27,0,3,0,0,0,1,1,0,0,0,5,412,8,727,0
83,Panchayat Union Middle School Vadakumarai North East wing,939,2,5,0,0,348,2,0,0,0,0,2,348,353,67,17,802,1,1,1,0,0,0,29,8,815,0
84,Panchayat Union Middle School Vadakumarai East North Wing,676,2,0,0,2,270,0,0,572,270,247,2,9,1,1,1,6,0,0,37,0,0,1,0,30,608,0
85,Panchayat Union Middle School Sarvai Tin Building south West wing,783,0,1,0,231,331,624,12,0,46,0,6,0,0,0,2,358,841,402,4,0,0,0,0,0,630,0
86,Panchayat Union Middle School Sarvai North East wing,971,0,0,58,0,0,14,3,1,1,1,53,649,1,0,3,1,0,30,4,0,4,0,0,0,844,0
87,Panchayat Union Elementary School Thenkumarai North Eastwing,857,1,237,0,312,6,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,655,0
88,Panchayat Union Elementary School Thenkumarai North Westwing,864,3,301,43,0,279,0,1,2,279,0,1,3,0,0,0,670,0,0,36,0,1,0,0,2,672,0
89,Govt Higher Sec School Sathapadi South Facing North West Wing,1321,32,48,929,357,476,1,0,0,2,1,1,4,3,0,0,0,0,2,8,0,476,0,0,0,937,0
90,Govt Higher Sec School Sathapadi South Facing North Middle Wing,565,4,426,0,0,197,0,0,202,1,5,0,0,0,0,1,0,0,0,20,0,0,197,0,4,430,0
91,Govt Higher Sec School Sathapadi (SSA) North Middle portion,924,1,341,0,0,322,2,322,5,740,0,0,0,0,0,57,0,0,7,0,5,3,0,0,1,745,0
92,Panchayat Union Middle School Punalvasal (SSA) West Middle Building,1186,0,907,453,0,366,2,0,5,0,0,1,0,0,0,1,366,4,7,0,1,1,2,41,28,912,0
93,Panchayat Union Middle School Punalvasal (SSA) West Middle Wing,1120,1,42,0,0,636,2,4,2,1,1,2,1,0,636,1,0,1,287,0,0,3,6,991,1,994,0
94,Panchayat Union Elementary School Chinnapunal Vasal (SSA) South East Wing,1097,2,307,33,0,376,0,0,1,768,0,4,0,0,3,3,0,1,0,0,2,36,1,376,2,772,0
95,Government High School Navalur East Facing South East Wing,1117,1,856,0,51,263,0,0,0,3,263,516,2,17,0,1,0,1,0,0,0,1,1,0,1,859,0
96,Government High School Navalur East South Facing West Wing,1068,1,0,4,345,386,386,0,48,0,1,1,0,843,0,0,0,46,1,1,0,7,1,0,3,846,0
97,Government High School Navalur West Facing South East Wing,789,0,623,275,0,273,3,24,2,273,7,0,0,0,0,3,0,0,3,0,0,1,1,31,6,630,0
98,Panchayat Union Elementary School Sithern East South Wing,757,52,0,0,2,249,0,249,256,3,3,0,3,0,4,0,0,0,1,9,0,0,1,3,1,584,0
99,Panchayat Union Elementary School Sitheri West Facing East Middle portion,762,0,1,0,36,336,1,0,7,2,0,0,1,1,1,0,0,0,0,336,244,0,4,633,1,637,0
100,Panchayat Union Elementary School Sitheri East Facing West,1141,4,279,901,473,112,20,2,0,0,0,0,0,2,0,6,0,663,1,313,1,34,29,29,29,669,0
101,Panchayat Union Elementary School Sitheri West Facing East North Wing,483,1,0,0,0,186,0,0,0,2,0,343,0,0,1,24,1,0,16,1,186,1,1,0,0,344,0
102,Government High School Govindhampalayam (SSA) West South Wing,961,2,5,0,0,398,4,0,0,0,3,0,0,0,0,0,0,4,0,0,0,0,0,14,5,966,0
103,Government High School Govindhampalayam (SSA) West North Wing,708,2,3,565,15,206,0,0,0,33,0,1,206,0,1,1,2,0,0,0,0,0,300,2,2,567,0
104,Government High School Govindhampalayam South,974,1,55,49,0,307,2,3,0,2,3,0,1,0,812,0,3,0,1,1,0,2,1,383,1,815,0
105,Panchayat Union Elementary School Veepampoondi East South Wing,693,0,578,0,0,260,0,0,0,260,1,3,3,0,0,1,0,4,0,1,0,1,2,285,0,582,0
106,Panchayat Union Elementary School Veepampoondi North East Wing,591,2,22,1,530,265,0,265,2,1,0,3,0,1,0,0,2,0,0,0,0,0,0,208,5,535,0
107,Panchayat Union Elementary School Vepampoondi North west Wing,1061,0,907,51,0,437,0,0,1,3,0,0,40,0,2,0,0,2,0,1,0,0,5,370,5,912,0
108,Panchayat Union Elementary School Puliyankurichi North Western Wing,890,2,341,0,1,341,0,0,0,76,1,2,0,0,0,4,0,0,794,29,0,1,0,338,1,798,0
109,Panchayat Union Elementary School Puliyankurichi North East Wing,848,2,232,0,4,232,0,615,1,0,1,0,0,0,2,20,1,0,26,0,2,3,1,1029,3,619,0
110,Government High School Puliyankurichi North West Wing,848,1,38,0,0,410,658,4,13,4,0,0,1,0,0,0,0,0,3,3,0,1,0,320,3,662,0
111,Government High School Puliyankurichi North Facing Middle wing,421,0,0,15,0,159,0,0,31,288,0,0,0,0,0,0,0,2,0,0,2,0,0,181,0,289,0
112,Panchayat Union Middle School Iluppantham North Middle Wing,1112,1,0,950,438,43,0,0,3,0,0,9,0,0,13,3,4,2,5,0,0,0,1,79,1,959,0
113,Panchayat Union Middle School Iluppantham North East Wing,725,0,4,245,40,245,0,1,0,0,0,0,0,0,0,589,0,1,0,26,2,1,0,437,0,593,0
114,Panchayat Union Elementary School Old Bazaar St Veeraganur East Middle Wing,1238,3,1022,0,1,580,6,7,0,0,0,0,3,0,4,0,0,1,1,1,3,1,1,272,0,1027,0
115,Panchayat Union Elementary School Old Bazaar St Veeraganmur East South Wine,816,0,6,1,2,270,4,3,270,0,0,0,0,28,3,0,0,1,0,0,6,0,6,280,0,584,0"""

def main():
    ac_id = "TN-081"
    
    # Load existing data
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    with open(results_file) as f:
        data = json.load(f)
    
    existing_count = len(data.get('results', {}))
    
    # Parse CSV
    reader = csv.DictReader(io.StringIO(csv_data))
    
    # Get candidate columns (C1 through C23)
    new_results = {}
    
    for row in reader:
        booth_no = int(row['Station No'])
        booth_id = f"{ac_id}-{booth_no:03d}"
        
        # Extract votes for each candidate (C1-C23)
        votes = []
        for i in range(1, 24):
            col_name = None
            for key in row.keys():
                if key.startswith(f'C{i}:'):
                    col_name = key
                    break
            if col_name:
                try:
                    votes.append(int(row[col_name]))
                except:
                    votes.append(0)
        
        # Get NOTA
        nota = int(row.get('NOTA', 0))
        votes.append(nota)
        
        total = int(row.get('Total Valid Votes', sum(votes)))
        
        new_results[booth_id] = {
            'votes': votes,
            'total': total,
            'rejected': 0
        }
    
    # Merge with existing
    for booth_id, result in new_results.items():
        if booth_id not in data['results']:
            data['results'][booth_id] = result
    
    data['totalBooths'] = len(data['results'])
    data['source'] = data.get('source', '') + ' (manual CSV import)'
    
    # Save
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    new_count = len(data['results'])
    print(f"AC081: {existing_count} -> {new_count} booths (+{new_count - existing_count})")

if __name__ == "__main__":
    main()
