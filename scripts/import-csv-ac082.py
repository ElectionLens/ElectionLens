#!/usr/bin/env python3
"""Import manually extracted CSV data for AC082."""

import json
import csv
import io
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")

csv_data = """Station No,Station Name,Electors,C1,C2,C3,C4,C5,C6,C7,C8,C9,C10,C11,C12,C13,C14,C15,C16,C17,C18,C19,C20,C21,C22,C23,NOTA,Total Valid,Tendered
1,Govt Tribal Residence Middle School Thalvallam North Wing,880,2,29,26,682,12,2,1,2,5,2,0,3,2,2,6,4,251,692,329,0,1,10,1,48,682,0
2,Govt Tribal Residence Middle School Thalvallam North West Wing,828,2,2,2,3,2,1,6,41,22,298,349,2,0,732,1,0,735,0,0,1,0,3,0,0,732,0
3,Govt Tribal Residence Middle School Thalvallam South Wing,831,0,311,0,12,5,0,320,2,11,1,0,31,2,724,7,0,1,2,7,2,2,3,719,1,719,2
4,Govt Tribal Residence Elementary School Sembarukai North West Wing,716,3,7,3,170,602,605,341,7,15,1,7,7,0,3,1,0,7,0,1,0,0,1,1,2,602,27
5,Panchayat Union Middle School Mannur North West Wing,622,4,144,0,525,0,0,0,0,0,0,2,345,0,0,0,525,0,4,1,1,0,0,4,6,525,6
6,Govt Tribal Residence Elementary School Kariyakovil North Wing,1141,387,952,946,43,452,1,1,0,6,0,4,5,0,3,2,18,5,8,6,2,3,0,2,2,946,2
7,Panchayat Union Elementary School Thalakkarai West Wing,884,14,14,13,326,13,5,11,2,12,734,256,737,3,3,4,3,3,4,33,1,2,6,0,3,734,0
8,Govt Tribal Residence Middle School Sulankurichi South West Wing,1128,15,69,12,12,15,10,6,7,1,7,0,318,0,984,1,5,976,489,2,0,2,0,3,8,976,1
9,Govt Tribal Residence Elementary School Kunnur South East Wing,794,0,0,236,6,367,0,33,0,0,6,0,2,9,3,2,2,0,2,679,0,677,0,0,3,679,2
10,Govt Tribal Residence Elementary School Chittampattu North East Wing,422,0,0,0,0,189,118,22,3,0,2,2,372,3,2,6,1,3,3,6,6,1,0,0,368,368,1
11,Govt Tribal Residence High School Kunnur Room No 2,450,159,5,4,165,369,1,373,0,0,0,11,0,1,1,1,1,3,2,8,1,4,0,3,1,369,2
12,Panchayat Union Elementary School Kallur North West Wing,465,13,5,360,150,365,0,141,0,0,4,1,1,0,0,1,7,10,5,1,3,3,1,3,2,360,11
13,Mudavankovil Anganwadi Building Facing North,594,169,12,288,17,15,545,539,9,0,5,0,1,2,1,1,4,6,2,1,0,1,0,6,4,539,0
14,Panchayat Union Elementary School Adiyanur North East Wing,954,349,317,0,6,1,5,758,0,4,0,8,3,1,1,31,5,1,5,3,3,11,6,1,1,758,0
15,Govt Tribal Residence Elementary School Nagalur South wing,903,2,2,3,5,4,2,4,2,2,2,5,2,9,230,30,18,0,330,5,4,1,26,662,7,662,22
16,Panchayat Union Middle School Edayapatty Room No.3,795,1,0,0,0,3,0,0,186,25,0,149,0,265,1,631,1,0,632,0,0,0,0,0,0,631,0
17,Panchayat Union Middle School Edayapatty Room No.2,1373,3,5,0,0,4,2,6,397,206,402,69,0,0,3,6,1,0,1,1,9,263,0,1,0,1114,0
18,Panchayat Union Elementary School Kathiripatty Facing South,777,340,4,0,0,0,0,3,23,0,1,0,36,0,2,0,2,681,4,0,0,685,0,0,0,681,0
19,Panchayat Union Middle School Edayapatty Facing South,686,0,0,22,196,0,165,182,0,0,1,0,0,0,1,0,1,1,0,4,0,1,0,31,574,574,0
20,Panchayat Union Middle School Edayapatty South West wing,842,4,1,0,2,174,207,233,1,1,2,2,0,1,1,0,0,0,0,0,127,251,0,0,0,660,3
21,Panchayat Union Elementary School Thandanur Tiled North East Wing,837,0,0,0,0,0,0,247,0,0,2,0,0,0,1,3,7,1,52,2,45,111,153,2,693,693,3
22,Panchayat Union Elementary School Thandanur Terraced North East Wing,751,2,270,0,1,0,0,1,0,1,0,0,1,2,2,2,594,0,594,9,0,0,0,0,0,594,2
23,Panchayat Union Elementary School Thandanur Tiled North West Wing,556,0,33,68,0,224,1,1,2,0,0,0,0,2,1,2,0,103,2,1,1,442,5,0,0,442,0
24,Panchayat Union Elementary School Panaimadal Facing West,867,25,0,20,2,1,0,0,0,0,4,0,0,0,379,0,0,0,258,1,0,1,691,2,0,691,0
25,Panchayat Union Elementary School Panaimadal Tiled North Wing,816,0,0,0,0,52,0,0,1,14,0,0,0,347,1,267,1,2,0,1,1,1,688,3,0,688,0
26,Panchayat Union Elementary School Panaimadal South East Wing,671,25,0,0,0,240,45,0,0,1,1,0,239,0,0,0,1,0,2,0,1,1,556,2,0,556,0
27,Panchayat Union Middle School Sekkadipatti Facing North,1209,115,389,0,0,2,0,432,89,2,0,0,0,4,0,0,0,0,1,0,1,2,1037,6,0,1037,0
28,Panchayat Union Middle School Sekkadipatti (SSA) Middle Room,761,47,284,0,20,0,0,0,0,1,0,1,0,0,0,267,1,0,3,0,0,1,625,0,0,625,0
29,Panchayat Union Elementary School Vellalapatti New South East Wing,737,243,38,0,2,0,2,1,0,240,36,0,1,0,0,0,0,1,0,1,1,1,567,6,0,567,0
30,Panchayat Union Elementary School Vellalapatti New South west Wing,769,340,0,3,5,0,0,0,37,0,0,0,0,0,274,1,3,0,0,0,1,3,667,7,0,667,0
31,Government High School Vellalapatti South West Wing,604,0,0,1,0,2,0,0,1,20,0,490,0,194,28,242,22,28,29,30,0,495,5,0,0,495,0
32,Panchayat Union Elementary School V.Ganesapuram South East Wing,734,3,0,0,0,1,0,1,304,0,44,604,0,201,47,1,1,606,2,0,0,0,0,0,0,606,0
33,Panchayat Union Middle School A.Komarapalayam SSA West Centre Room,636,0,0,2,0,164,238,129,546,0,0,8,1,3,1,0,546,0,0,0,0,0,0,0,0,546,0
34,Panchayat Union Middle School A Komarapalayam South Room No 2,729,2,1,0,0,0,22,0,0,92,0,0,1,2,223,269,1,1,617,0,2,1,0,625,8,625,0
35,Panchayat Union Elementary School Kalyanagiri Tiled South Wing,1121,0,938,0,54,0,409,0,1,1,1,0,1,1,1,0,3,0,123,3,0,0,0,940,0,940,0
36,Panchayat Union Elementary School Kalyanagiri South west Wing,610,1,1,30,0,231,0,524,0,0,0,0,0,0,0,0,0,0,235,0,1,527,3,0,0,527,0
37,Panchayat Union Elementary School Kottavadi Tiled East North Wing,595,0,60,1,0,1,0,25,0,0,0,0,0,184,0,226,0,503,1,2,0,2,1,504,1,504,0
38,Panchayat Union Elementary School Kottavadi Tiled West North Wing,1284,25,0,0,0,0,0,1058,573,51,0,300,1,0,0,2,116,3,0,0,0,5,0,0,0,1067,0
39,Panchayat Union Elementary School Kottavadi SSA West South Wing,997,2,0,4,1,337,94,0,44,0,0,0,0,0,0,825,0,0,2,342,0,1,1,1,833,833,0
40,Panchayat Union Elementary School Kottavadi SSA West North wing,817,1,1,1,661,243,21,1,267,1,0,2,1,0,0,0,0,0,0,0,2,117,0,1,3,664,0
41,Panchayat Union Middle School Kalleripatti Facing West,507,411,1,159,158,0,0,20,0,0,0,0,70,0,0,1,0,0,0,0,0,1,1,412,1,412,0
42,Panchayat Union Elementary School Mettudayampalayam Facing North,568,0,0,0,22,165,0,18,0,0,0,0,0,0,0,265,0,0,0,470,0,0,0,471,0,471,0
43,Panchayat Union Elementary School Mettudayampalayam Tiled East North Wing,641,0,0,210,0,0,0,0,0,0,509,0,33,0,0,0,14,249,0,1,0,1,1,512,3,512,0
44,Panchayat Union Middle School Vaithyagoundanpudur Tiled Facing North,1215,149,0,64,989,2,1,1,378,371,3,2,0,1,1,1,2,6,5,2,0,0,0,998,9,998,0
45,Government High School Periyakrishnapuram North East wing,945,0,301,0,0,105,2,0,1,56,0,0,0,2,0,804,0,4,0,330,0,0,3,809,5,809,0
46,Government High School Periyakrishnapuram SSA South East wing,934,86,348,0,279,2,1,0,2,0,0,0,0,0,5,0,0,0,784,57,2,1,1,791,7,791,0
47,Panchayat Union Elementary School Mathur North East wing,651,0,0,59,38,1,1,306,1,1,1,1,1,1,1,150,0,0,188,0,1,0,0,562,10,562,0
48,Panchayat Union Elementary School Mathur North West wing,606,227,76,3,0,27,0,1,3,0,2,26,528,0,6,534,0,0,0,0,0,0,0,0,0,534,0
49,Panchayat Union Middle School Chinnakrishnapuram North West wing,962,3,0,2,154,345,46,0,2,276,1,0,1,0,4,0,0,1,1,1,45,104,1,0,0,837,0
50,Panchayat Union Elementary School Abinavam Facing East,939,0,4,4,1,250,348,0,0,0,2,0,2,1,0,1,763,6,769,0,0,0,0,0,0,769,0
51,Anganwadi Building Ahinavam Facing North,1068,54,331,0,338,2,1,0,3,1,0,36,1,0,1,3,1,1,0,0,0,3,776,8,0,776,0
52,Panchayat Union Middle School Yethapur South West wing,976,1,4,0,305,56,0,50,0,0,0,0,2,1,258,0,2,0,0,0,2,3,684,11,0,684,0
53,Panchayat Union Middle School Yethapur South East wing,1003,15,1,1,0,0,0,0,24,0,1,0,0,298,341,0,0,0,0,0,2,0,47,683,5,683,0
54,Panchayat Union Middle School Yethapur SSA North Middle Portion,879,306,0,0,0,0,0,349,0,11,3,0,0,0,0,1,4,0,0,2,3,0,0,726,9,726,0
55,Panchayat Union Middle School Yethapur North East wing,812,284,0,35,0,276,37,1,0,0,0,0,0,3,2,0,0,1,1,3,86,5,335,643,5,643,0
56,Panchayat Union Middle School Yethapur East south West Wing,1022,42,0,4,2,2,4,301,2,0,1,2,9,0,1,3,1,2,1,0,0,328,0,0,803,803,0
57,Govt Higher Secondary School Yethapur SSA West North wing,1102,48,84,1,0,0,2,4,1,0,0,0,0,1,1,1,761,18,779,0,0,0,0,0,0,779,0
58,Govt Higher Secondary School Yethapur SSA West South wing,1067,0,308,23,0,44,0,3,1,0,0,1,349,1,2,0,0,0,0,1,1,1,0,0,735,735,0
59,Govt Girls Higher Secondary School Pethanaickenpalayam West South Wing,992,94,5,0,1,278,440,0,0,0,0,0,0,0,0,3,2,1,5,1,0,24,0,0,830,830,0
60,Govt Girls Higher Secondary School Pethanaickenpalayam West South Wing,556,0,1,42,4,0,0,1,1,1,110,1,236,0,0,0,2,424,5,429,0,0,0,0,0,429,0
61,Govt Girls Higher Secondary School Pethanaickenpalayam West North Wing,793,0,327,28,0,0,0,77,1,0,2,1,216,0,1,0,0,1,1,1,3,6,665,7,0,665,0
62,Govt Girls Higher Secondary School Pethanaickenpalayam East Middle Portion,801,49,5,275,0,0,1,18,0,0,0,0,5,4,0,0,1,1,1,276,1,1,638,5,0,638,0
63,Govt Boys Higher Secondary School Pethanaickenpalayam South East wing,1104,74,1,60,2,0,0,0,0,387,2,0,1,1,0,310,1,1,840,4,3,4,0,0,848,848,0
64,Govt Boys Higher Secondary School Pethanaickenpalayam Tiled West North Wing,1279,3,0,0,0,467,395,1,1,44,1,0,1024,99,1,0,0,409,171,190,0,0,21,0,1030,1038,0
65,Govt Boys Higher Secondary School Pethanaickenpalayam Tiled Buildidng West South Wing,541,0,0,26,0,0,0,0,1,0,1,1,64,0,0,1,431,952,384,0,60,0,0,2,2,412,0
66,Govt Boys Higher Secondary School Pethanaickenpalayam South West Wing,1142,1,2,1097,65,0,0,0,511,114,1,0,4,1,1,1,1,0,0,390,0,1,2,2,3,967,0
67,Govt Boys Higher Secondary School Pethanaickenpalayam South East wing,1332,1097,65,0,0,0,511,114,1,0,4,1,1,1,1,0,0,390,0,1,2,2,3,1097,15,1112,0
68,Panchayat Union Middle School Palandiyoor (SSA) West North Wing,962,90,0,0,0,310,1,0,99,0,0,1,0,323,0,0,6,7,0,0,1,1,839,3,0,842,0
69,Panchayat Union Elementary School Kalichettiyur Asbestos West South Wing,833,18,0,0,0,1,417,716,0,1,0,0,255,22,0,0,0,0,2,0,0,0,0,716,2,718,0
70,Panchayat Union Elementary School Chinnamasamudiram Tiled South West Wing,978,35,365,828,0,0,0,0,1,0,406,1,2,0,1,0,0,1,0,0,1,3,12,828,7,835,0
71,Panchayat Union Elementary School Chinnamasamudram Tiled South West Wing,829,110,0,769,0,0,13,2,361,271,0,0,4,2,1,0,1,1,1,0,0,1,451,2,771,771,0
72,Govt Girls Higher Secondary School Pethanaickenpalayam North East Wing,1442,594,3,0,0,0,1145,0,0,2,5,0,0,0,0,4,6,2,4,1,72,1,1145,2,0,1147,0
73,Panchayat Union Elementary School Thirumalainamasamudram Tiled South,1161,413,0,0,953,109,0,0,20,0,0,4,0,0,0,2,1,1,0,1,399,2,1,953,12,965,0
74,Panchayat Union Elementary School Puthiragoundanpalayam South West wing,900,307,44,651,14,0,277,1,0,3,0,0,0,0,0,3,1,1,0,0,0,0,0,651,0,651,0
75,Panchayat Union Elementary School Puthiragoundanpalayam South East wing,1218,0,984,0,492,1,0,0,0,0,2,4,0,2,5,4,114,0,1,24,333,1,1,984,12,996,0
76,Panchayat Union Elementary School Veera Goundamur Asbortos North West Wing,760,155,0,0,0,290,684,0,214,0,0,2,0,1,0,0,0,0,1,20,0,0,1,684,0,684,0
77,Panchayat Union Elementary School Veera Goundanur South West Wing,584,34,497,0,0,246,0,0,1,0,0,0,0,0,1,0,4,29,179,0,1,1,1,497,6,503,0
78,Panchayat Union Middle School Olappadi Tiled West North wing,865,86,320,0,3,0,0,0,32,12,2,254,0,0,1,0,2,0,0,0,713,0,1,713,6,719,0
79,Panchayat Union Middle School Olappadi Terraced South West wing,606,250,203,232,255,128,119,346,316,2,0,1,0,2,0,0,8,516,2,0,0,0,0,0,0,518,0
80,Panchayat Union Middle School Olappadi Tiled West South Wing,612,26,2,2,4,41,2,0,0,0,1,1,1,0,1,1,9,1,516,1,0,0,2,2,0,537,0
81,Panchayat Union Middle School Olappadi Terraced South East wing,345,536,0,0,0,14,1,1,27,1,1,0,2,2,0,0,1,1,1,276,0,8,4,1,278,278,0
82,Panchayat Union Elementary School Thennampillayur Tiled West,983,9,0,2,1,56,0,0,2,0,1,1,2,0,0,1,3,0,1,75,3,810,0,810,8,818,0
83,Panchayat Union Elementary School Umayalpuram South West wing,708,259,237,37,0,578,0,0,0,0,0,0,0,1,42,0,0,0,0,0,0,0,2,578,8,586,0
84,Panchayat Union Elementary School Umayalpuram South east wing,873,284,315,57,0,0,0,2,0,0,2,0,7,0,0,7,2,0,0,683,1,3,3,683,4,687,0
85,Panchayat Union Elementary School Umayalpuram Tiled West North wing,1131,352,330,163,2,4,0,0,38,0,0,0,0,1,0,894,0,2,0,0,0,2,0,894,5,899,0
86,Panchayat Union Elementary School Muthagoundanur Tiled South,987,359,237,1,0,38,1,0,0,0,1,799,0,0,0,0,0,152,6,0,1,2,1,2,0,802,0
87,Panchayat Union Elementary School Thamayanur Tiled East,1184,376,378,71,0,2,0,2,0,0,0,1,0,1,141,1,980,2,2,1,0,0,0,0,980,984,0
88,Panchayat Union Elementary School Vadugathampatty South Wing,1034,223,306,887,1,0,0,0,0,0,0,1,1,2,309,5,0,0,37,1,1,0,4,0,887,891,0
89,National Aided Primary School West Rajapalayam Tiled North East Wing,1221,343,414,43,2,0,1,0,989,1,174,2,0,1,0,1,0,0,1,1,3,1,1,24,989,995,0
90,National Aided Primary School West Rajapalayam Tiled North West Wing,794,254,261,684,133,0,0,0,0,0,0,1,1,0,0,3,0,2,3,0,1,1,18,0,684,685,0
91,Panchayat Union Elementary School New Colony West Rajapalayam South,676,187,347,0,0,0,1,1,0,3,0,0,0,0,0,0,2,0,568,0,1,8,116,0,568,568,0
92,Panchayat Union Elementary School A.Karadipatty Tiled North,977,289,339,57,814,1,1,1,0,0,2,0,2,0,1,0,2,1,0,1,0,1,0,814,5,819,0
93,Government High School Ariyapalayam North Centre Room No.25,974,318,269,2,788,51,3,0,2,2,128,1,0,0,4,0,2,1,1,1,1,1,788,7,0,795,0
94,Government High School Arivapalayam North West wing Room No 24,982,306,340,96,0,2,805,6,0,0,42,0,2,1,1,1,3,0,0,0,2,1,2,805,5,810,0
95,Panchayat Union Middle School Dhalavaipatty North East Wing,972,7,2,412,20,340,1,0,0,1,1,1,1,29,0,2,3,3,0,0,24,288,0,45,815,818,0
96,Panchayat Union Middle School Dhalavaipatty North West Wing,803,2,0,299,1,0,0,1,3,22,26,671,0,3,678,7,0,0,0,0,0,0,0,0,0,678,0
97,Panchayat Union Middle School Palaniyapuri North East wing,721,2,2,2,2,0,65,0,41,225,230,2,4,0,1,0,1,578,6,0,0,0,0,0,0,584,0
98,Panchayat Union Middle School Palaniyapuri North West Building,697,4,0,0,1,0,0,100,2,206,225,0,0,3,0,0,2,2,1,33,3,0,229,582,3,585,0
99,Panchayat Union Elementary School Kalarampatty West North Building,647,0,168,0,95,0,2,0,2,30,0,1,1,0,0,0,0,0,0,0,2,530,3,0,0,533,0
100,Panchayat Union Elementary School Kalarampatty West South Building,907,72,371,0,51,0,1,0,0,0,0,0,206,0,0,0,2,0,2,0,5,711,4,0,0,715,0
101,Panchayat Union Elementary School Gopalapuram Tiled West North Wing,1179,112,446,359,0,0,44,0,0,0,0,0,2,0,0,0,1,3,3,1,4,0,975,6,0,981,0
102,Panchayat Union Elementary School Gopalapuram Tiled North West Wing,964,58,0,319,0,290,78,6,0,1,2,0,0,1,0,0,1,0,0,1,1,3,761,14,0,775,0
103,Panchayat Union Elementary School Akkichettypalayam Facing North,756,0,246,35,0,0,344,1,10,0,0,0,0,0,1,0,0,1,0,0,1,1,640,3,0,643,0
104,Government Higher Secondary School Kalpaganur West North Wing,626,85,26,0,1,195,221,0,0,2,0,0,0,0,0,0,0,0,1,2,1,1,535,3,0,538,0
105,Government Higher Secondary School Kalpaganur Middle Wing Room No.12,825,41,385,0,1,0,0,0,0,0,200,10,0,1,0,1,0,0,0,0,1,1,254,641,11,652,0
106,Government Higher Secondary School Kalpaganur North West Wing Room No.5,916,0,2,0,0,329,4,123,5,36,0,2,1,0,2,2,0,0,1,1,1,763,3,0,0,766,0
107,Government Higher Secondary School Kalpaganur SSA North East Wing,565,4,0,0,2,119,111,0,199,27,0,0,0,0,0,0,0,0,0,0,1,1,464,4,0,468,0
108,Government Higher Secondary School Kalpaganur New East Wing,682,115,0,0,170,0,0,2,227,0,0,1,0,1,0,0,1,0,1,0,1,58,577,3,0,580,0
109,Panchayat Union Middle School Sivagangaipuram SSA North East Wing,679,186,0,0,0,1,2,0,39,2,0,0,86,1,0,0,0,0,0,0,230,1,548,5,0,553,0
110,Panchayat Union Middle School Sivagangaipuram New South West Wing,619,240,0,21,0,2,0,0,0,0,0,2,1,0,2,2,136,123,0,0,1,1,531,2,0,533,0
111,Panchayat Union Elementary School Ramanaickenpalayam Tiled West North Wing,917,343,742,346,1,0,0,3,0,0,0,2,917,343,742,346,1,0,742,6,0,0,0,0,0,748,0
112,Panchayat Union Elementary School Ramanaickenpalayam North West Wing,681,2,0,1,0,681,218,504,0,0,24,1,34,1,2,220,504,5,0,0,0,0,0,0,0,509,0
113,Panchayat Union Elementary School Ramanaickenpalayam Tiled West South Wing,735,3,3,0,0,735,229,229,577,1,38,0,1,0,71,0,0,1,2,48,1,0,1,1,0,583,0
114,Panchayat Union Elementary School Ramanaickenpalayam Tiled West Middle Wing,737,1,272,1,0,0,0,190,1,50,1,1,0,570,902,61,0,35,0,0,1,0,0,4,0,574,0
115,Panchayat Union Elementary School Ramanaickenpalayam Tiled North East Wing,275,292,679,1,0,0,3,2,0,1,1,3,636,249,32,0,40,0,0,1,0,0,511,179,2,687,0
116,Government High School Ramanaickenpalayam Terracd North East Wing,511,179,2,0,2,0,1,0,0,1,0,3,1,511,2,0,0,0,0,0,0,0,0,0,0,513,0
117,Government High School Ramanaickenpalayam East Middle Wing,833,0,250,292,10,1,0,0,1,1,0,1,56,1,0,0,0,618,0,1,1,1,2,618,3,621,0
118,Government High School Ramanaickenpalayam East North Wing,435,609,166,0,34,0,0,0,0,2,49,0,175,1,1,1,3,0,0,1,0,1,1,435,2,437,0
119,Panchayat Union Elementary School Oothumedu Terraced Facing North,664,534,30,0,0,200,214,78,2,0,1,0,0,1,0,2,0,0,2,1,2,0,534,5,0,539,0
120,Panchayat Union Elementary School Rasi Nagar North West Wing,482,34,4,145,591,0,1,0,2,0,0,0,0,210,2,76,0,0,0,476,0,0,0,2,476,482,0
121,Panchayat Union Elementary School Rasi Nagar South West Wing,364,135,0,1,1095,0,0,2,44,801,0,0,0,0,2,2,0,1,2,247,0,0,1,801,7,808,0
122,Panchayat Union Elementary School Appamasamudram South West Wing,676,0,248,0,22,0,0,548,4,52,0,219,0,0,0,0,0,1,0,0,0,1,1,548,4,552,0
123,Panchayat Union Elementary School Appamasamudram South East Wing,806,0,243,0,0,0,0,0,36,1,4,0,2,251,0,47,589,1,1,1,1,1,589,2,0,591,0
124,Panchayat Union Elementary School Ramanathapuram East North Wing,448,0,0,91,0,0,0,3,1054,472,34,0,0,0,0,1,0,1,1,1,1,1,1054,6,0,1060,0
125,Panchayat Union Elementary School Udayampatti Terraced Facing North,1255,337,0,0,693,823,252,66,1,0,27,0,0,0,0,2,0,2,0,1,2,1,1,693,2,695,0
126,PUMS Selliampalayam Terraced South East Wing,1161,852,0,323,2,1,0,23,0,258,2,73,3,0,0,690,0,0,0,0,2,0,1,2,690,694,0
127,Govt Adi-Dravidar Welfare High School Kothampady SSA East South wing,858,317,43,1,2,260,1,682,1,1,0,0,0,0,0,0,4,682,5,0,0,0,0,0,0,687,0
128,Govt Adi-Dravidar Welfare High School Kothampady SSA East Middle Room 2,883,385,1,1,6,0,68,241,709,0,0,1,1,1,1,709,2,0,0,0,0,0,0,0,0,711,0
129,Govt Adi-Dravidar Welfare High School Kothampady SSA East Room No.4,1122,2,3,2,310,307,32,0,209,0,0,3,0,0,876,0,1,1,1,876,12,0,0,0,0,888,0
130,Panchayat Union Elementary School Alagapuram Tiled North,848,0,0,0,0,0,42,0,0,0,272,247,638,1,1,73,0,638,6,0,0,0,0,0,0,644,0
131,Panchayat Union Middle School Thennankudipalayam North East Wing,455,558,0,0,0,0,181,455,0,33,0,0,0,31,202,1,1,0,0,2,1,2,0,1,455,456,0
132,Panchayat Union Middle School Thennengudipalayam East north Wing,812,598,0,274,41,41,0,1,0,0,2,1,0,0,0,0,0,0,2,0,235,0,1,598,2,600,0
133,Panchayat Union Middle School Thennankudipalayam East South Wing,712,23,0,239,372,0,1,1,67,0,0,712,0,1,1,1,884,1,1,1,1,2,0,0,712,721,0
134,Panchayat Union Middle School Thennankudipalayam SSA East North Wing,520,189,0,0,0,0,520,26,0,651,0,3,0,37,0,1,0,2,0,0,0,0,261,1,520,528,0
135,Integrated Child Development Centre Fort Attur South East Wing,1188,0,0,0,952,0,1,481,321,2,89,4,2,2,39,2,0,2,0,1,2,1,3,952,14,966,0
136,Integrated Child Development Centre Fort Attur South West Wing,844,0,297,1,717,313,73,2,0,25,0,0,0,0,0,0,1,1,0,0,2,1,1,717,6,723,0
137,Municipal Elementary School Vadakku kadu Mullaivadi South West wing,329,224,633,1,0,0,0,35,0,3,1,1,1,0,2,0,1,0,33,0,827,1,1,633,3,636,0
138,Municipal Elementary School Vadakku kadu Mullaivadi South East wing,675,550,250,0,22,0,50,0,1,219,1,0,0,0,0,1,0,1,0,2,1,1,1,550,11,561,0
139,Municipal Elementary School Chandragiri Attur East North Wing,949,402,787,0,3,2,0,1,0,0,1,0,0,0,0,34,2,1,275,787,7,0,0,0,0,794,0
140,Municipal Elementary School Chandragiri Attur West North Wing,781,1,0,274,609,0,0,0,271,0,1,0,0,0,1,4,0,1,2,0,17,36,1,609,3,612,0
141,Municipal Elementary School Chandragiri Attur West South wing,943,259,375,0,733,4,0,77,0,0,0,1,11,1,0,0,0,1,0,1,1,1,1,733,5,738,0
142,Municipal Elementary School Chandragiri Attur East South wing,631,31,231,0,1,0,0,0,3,0,0,631,331,800,2,4,1,2,0,20,1,1,2,1,631,636,0
143,Municipal Middle School Venkatasamy St Mullaivadi South East Wing,1097,1,55,52,2,1,3,3,3,3,3,0,346,465,2,13,1,0,1,0,0,899,14,0,0,913,0
144,Municipal Middle School Venkatasamy St Mullaivadi East North Wing,1287,17,1,0,0,0,1,45,504,6,422,1,1,36,1,1,4,2,0,2,2,435,38,1033,15,1048,0
145,Municipal Middle School Venkatasamy St Mullaivadi North West Wing,1148,367,1,1,69,0,0,1,2,7,1,0,0,0,201,246,1,0,1,40,0,0,2,0,926,935,0
146,Municipal Middle School Venkatasamy St Mullaivadi East South Wing,660,4,1,0,0,26,3,0,1,0,1,526,14,0,0,0,0,0,0,0,0,0,0,0,0,540,0
147,Municipal Middle School Venkatasamy St Mullaivadi West North Wing,840,56,0,0,1,15,317,0,1,0,0,1,3,0,0,1,0,0,0,247,1,644,11,0,0,655,0
148,C.S.I. High School Kamarajanar Road Attur Room No.7,673,31,341,0,22,158,1,0,0,0,0,0,0,0,2,1,1,1,1,0,2,561,4,0,0,565,0
149,C.S.I. High School Kamarajanar Road Attur East North Wing Room No 8,932,46,0,0,0,0,345,280,2,34,0,1,0,0,1,0,2,0,0,0,1,712,2,0,0,714,0
150,R.C.Middle School East Madha Kovil Street Attur South West Wing,1302,565,60,41,0,0,0,1,1,295,2,1,1,1,0,1,2,0,1,1,3,51,0,50,976,985,0
151,National Aided Middle School Thayumanavar Street North East Wing,919,0,0,0,2,0,361,0,256,0,0,1,3,2,2,1,0,2,214,0,0,22,2,0,730,741,0
152,National Aided Middle School Thayumanavar Street North West Wing,614,2,0,2,23,0,1,0,0,1,0,0,1,1,242,1,310,0,0,0,22,0,1,0,512,518,0
153,National Aided Middle School Thayumanavar Street South East Wing,645,2,0,182,13,1,0,1,1,0,1,0,1,0,0,0,0,0,22,47,1,256,123,535,6,541,0
154,National Aided Middle School Thayumanavar Street South West Wing,683,3,3,0,0,0,0,0,0,0,1,456,10,0,0,0,0,0,0,0,0,0,0,0,0,466,0
155,Municipal Elementary School Oldpet Tiled South East Wing,569,151,0,29,0,0,251,1,15,0,0,0,0,0,0,0,0,2,0,0,1,450,2,0,0,452,0
156,Municipal Elementary School Oldpet East North Wing,893,22,0,130,507,0,0,2,0,2,1,1,42,0,0,1,5,2,0,0,1,716,6,0,0,722,0
157,Municipal Elementary School Oldpet South West Wing,969,443,0,46,0,0,290,0,27,0,0,0,1,0,0,2,3,1,1,2,2,818,4,0,0,822,0
158,Chinnasamy Ayya Middle School Pudupet North Building South West Wing,841,47,365,249,1,0,0,33,0,0,0,0,0,0,0,0,0,1,1,1,1,699,10,0,0,709,0
159,Chinnasamy Ayya Middle School Pudupet South East Wing,715,0,0,2,0,0,0,0,0,0,195,18,0,30,363,1,1,610,7,0,0,0,0,0,0,617,0
160,Chinnasamy Ayya Middle School Pudupet South Building East North Wing,873,0,2,0,2,253,362,0,0,0,53,1,1,36,0,1,1,1,714,6,0,0,0,0,0,720,0
161,Chinnasamy Ayya Middle School Pudupet North Middle East Wing,583,0,5,263,30,0,114,3,1,29,0,0,0,0,0,0,1,2,448,7,0,0,0,0,0,455,0
162,Chinnasamy Ayya Middle School Pudupet South Building East South Wing,500,154,1,0,1,1,0,0,0,0,223,1,0,0,1,1,9,36,0,0,4,1,433,4,0,437,0
163,Chinnasamy Ayya Middle School Pudupet North Middle Portion,1079,0,0,66,446,0,46,0,1,1,0,0,0,0,247,0,2,1,1,1,1,1,814,9,0,823,0
164,Integrated Child Development Centre Oldpet East South Wing,720,365,1,0,156,0,0,0,0,0,0,0,1,0,6,0,0,0,27,0,0,0,556,8,0,564,0
165,Integrated Child Development Centre Oldpet East North Wing,813,543,0,0,0,0,17,0,0,0,0,1,0,52,0,0,0,0,0,0,0,0,613,0,0,613,0
166,Municipal Elementary School Oldpet West Building East South Wing,791,422,0,0,0,0,0,1,0,27,0,27,0,0,0,0,0,0,120,0,1,0,598,10,0,608,0
167,C.S.1. Elementary School Bazaar Street Tiled South 1st Room East wing,640,18,34,0,1,179,1,3,1,0,0,0,0,2,0,285,1,0,1,1,1,1,529,5,0,534,0
168,C.S.L. Elementary School Bazaar Street Tiled South 2nd Room Middle wing,701,0,0,4,29,0,214,282,0,40,2,0,0,0,0,0,0,2,0,0,1,1,575,7,0,582,0
169,Municipal Elementary School Jothi Nagar West Building North Middle Wing,810,340,0,0,0,5,51,0,0,200,2,0,27,0,0,0,1,0,1,1,2,1,631,7,0,638,0
170,Municipal Elementary School Jothi Nagar West Building North East Wing,774,354,0,30,0,0,0,0,1,0,0,0,164,0,1,0,3,0,0,32,1,1,587,7,0,594,0
171,C.S.L. High School Kamarajanar Road West Building East Class Room-1,676,138,21,0,0,0,0,0,0,0,0,2,0,0,2,43,289,1,1,1,0,1,499,9,0,508,0
172,C.S.I. High School Kamarajanar Road West Building East Class Room-3,761,0,199,246,0,0,0,2,1,0,0,0,0,0,39,0,0,1,0,0,8,47,543,9,0,552,0
173,C.S.1. High School Kamarajanar Road West Building East Class Room-4,622,0,28,0,0,164,31,2,0,4,0,232,0,0,0,0,0,0,0,1,0,1,463,6,0,469,0
174,Municipal Middle School Gandhi Nagar West Building East Middle Wing,654,26,0,0,0,0,27,0,0,0,1,147,0,0,267,0,0,0,1,1,3,1,474,7,0,481,0
175,Municipal Middle School Gandhi Nagar West Building East Middle Wing,626,0,3,0,0,0,0,0,25,820,344,211,0,1,1,1,39,1,0,0,0,0,0,0,626,633,0
176,Municipal Middle School Gandhi Nagar South West Wing,697,0,963,397,1,16,109,0,0,0,0,5,168,697,14,0,0,0,0,0,0,0,0,0,0,711,0
177,Municipal Middle School Gandhi Nagar West Building East North Wing,616,0,818,55,382,1,0,0,144,0,1,0,0,0,1,1,26,1,1,3,616,9,0,0,0,625,0
178,Municipal Elementary School Jothi Nagar East Building North West Wing,1139,198,1,420,0,58,0,0,0,2,0,1,27,1,1,0,1,3,1,2,716,10,0,0,0,726,0
179,Municipal Elementary School Jothi Nagar East Building North East Wing,662,1023,0,0,148,0,393,66,0,47,0,0,1,1,0,0,0,1,1,1,0,2,1,662,10,672,0
180,C.S.1. Elementary School Bazaar Street Tiled South 3rd Room West Wing,966,53,463,0,0,0,0,313,0,0,0,2,1,0,1,0,0,0,0,2,4,1,840,4,0,844,0
181,C.S.I. Elementary School Bazaar Street East Building Facing West,1277,365,0,0,0,0,0,629,2,85,1,0,0,1,6,4,2,1,3,1,2,1,1103,7,0,1110,0
182,Govt Adi-Dravidar Welfare High School Ambethkar SSA North Building South,898,8,1,8,0,0,39,0,0,314,773,219,2,0,0,0,1,1,0,0,2,1,1,597,3,600,0
183,Govt Adi-Dravidar Welfare High School Ambethkar South East Wing,616,155,0,0,0,19,0,507,1,0,1,0,0,0,0,2,0,0,3,1,1,2,734,4,0,738,0
184,Govt Adi-Dravidar Welfare High School Ambethkar Facing South East Wing,339,138,0,0,0,0,50,0,0,0,0,0,0,0,319,0,0,0,0,1,2,1,511,4,0,515,0
185,Govt Adi-Dravidar Welfare High School Ambethkar North West Wing,645,2,222,1,0,0,0,733,2,1,1,0,70,0,0,1,0,1,0,3,1,1,645,3,0,648,0
186,Govt Adi-Dravidar Welfare High School Ambethkar North East Wing,677,181,0,53,0,0,0,1,1,0,4,0,0,1,1,0,0,0,331,1,1,1,576,4,0,580,0
187,Bharathiyar Higher Secondary School Attur West North Wing Room No.15,914,344,244,28,0,3,1,0,0,0,0,30,0,2,1,1,0,0,0,1,1,1,657,3,0,660,0
188,Bharathiyar Higher Secondary School Attur West Middle Portion Room No 13,637,0,152,28,0,31,0,274,0,0,0,0,0,0,0,0,0,0,1,3,1,490,7,0,0,497,0
189,Bharathiyar Higher Secondary School Attur West South Wing Room No 12,1191,418,0,74,0,0,0,1,0,0,52,0,0,1,223,0,1,2,1,2,3,3,781,10,0,791,0
190,Panchayat Union Elementary School Kallanatham Middle Portion,432,224,0,0,141,0,1,0,51,523,0,0,0,0,0,1,0,13,0,0,0,0,1,432,2,434,0
191,Panchayat Union Elementary School Kallanatham South West Wing,924,3,0,3,2,0,0,0,0,924,1,301,341,28,1,0,1,1,76,0,0,2,0,1,0,762,0
192,Panchayat Union Elementary School Kallanatham South East Wing,775,338,255,8,0,49,1,1,0,1,2,0,0,2,2,2,659,4,0,0,0,0,0,0,0,663,0
193,Panchayat Union Elementary School Kallanatham South West Wing,816,349,264,43,0,25,0,2,0,3,0,1,1,1,695,6,0,0,0,0,0,0,0,0,0,701,0
194,Government High School Kallanatham East Middle Wing Room No.4,1094,3,2,1,0,0,78,0,1,0,0,0,1,2,441,0,0,0,414,946,6,0,0,0,0,952,0
195,Panchayat Union Middle School Ammampalayam SSA West South Wing,670,0,0,0,0,0,0,177,294,0,27,0,0,0,0,1,29,1,0,1,1,3,534,2,0,536,0
196,Panchayat Union Middle School Ammampalayam West South Wing,624,334,0,35,0,0,0,28,0,104,0,0,0,0,0,0,1,0,2,0,0,0,504,3,0,507,0
197,Panchayat Union Middle School Ammampalayam West North Wing,425,0,1,1,0,0,1,534,32,0,0,0,186,0,21,0,0,0,1,1,180,0,1,425,2,427,0
198,Panchayat Union Middle School Ammampalayam West South Wing,618,53,0,744,40,0,0,0,0,0,290,2,0,2,1,0,0,0,0,2,226,1,1,618,7,625,0
199,Panchayat Union Elementary School Amman Nagar North East Wing,837,0,38,47,0,0,297,270,1,1,0,0,1,0,1,3,0,1,0,1,2,6,669,9,0,678,0
200,Panchayat Union Elementary School Gandhipuram South West Wing,668,0,159,45,243,0,0,2,27,2,1,0,0,0,0,0,0,1,1,2,1,1,485,2,0,487,0
201,Panchayat Union Elementary School Narikuravar Colony North South East Wing,1049,0,356,3,46,0,0,0,0,2,2,5,1,478,2,9,1,1,1,0,1,1,909,8,0,917,0
202,Panchayat Union Elementary School Valayamadevi New East,1290,0,481,0,13,0,67,0,505,0,0,0,0,0,0,1,8,8,3,0,0,1,1087,7,0,1094,0
203,Panchayat Union Elementary School Valayamadevi New West,1086,4,0,62,55,2,0,0,375,376,0,0,2,0,0,2,0,0,1,1,1,1,882,4,0,886,0
204,Panchayat Union Elementary School Valayamadevi North middle wing,727,234,265,0,44,0,0,0,0,0,0,3,31,1,1,1,0,2,0,4,1,1,588,1,0,589,0
205,Panchayat Union Elementary School Valayamadevi Facing North West side,669,0,219,0,24,21,0,2,0,2,0,2,0,0,1,3,0,1,0,233,2,1,511,0,0,511,0
206,Panchayat Union Elementary School Thulukkanur Tiled East South Wing,775,2,307,891,0,336,0,0,0,2,1,1,0,0,0,0,53,0,1,69,1,1,1,775,6,781,0
207,Panchayat Union Elementary School Thulukkanur Tiled East South wing,1097,1,55,52,2,1,3,3,3,3,3,0,346,465,2,13,1,0,1,0,0,899,14,0,0,913,0
208,Panchayat Union Elementary School Thulukkanur Tiled North East Wing,1012,2,1,620,0,0,0,0,39,0,1,613,4,46,2,257,260,806,1,0,0,7,0,0,0,806,0
209,Panchayat Union Elementary School Thulukkanur Tiled North west Wing,923,4,0,646,0,8,654,40,45,0,0,0,0,0,0,3,0,0,277,273,0,0,1,1,1,654,0
210,Panchayat Union Elementary School Narasingapuram New North East Middle Wing,754,55,1,613,300,34,620,215,2,0,1,0,7,0,0,0,0,0,0,2,0,0,0,0,0,620,0
211,Panchayat Union Elementary School Narasingapuram New North West Middle Wing,529,0,236,36,0,747,0,0,27,0,0,0,0,0,0,0,0,0,222,0,0,0,521,0,8,747,0
212,Panchayat Union Elementary School Narasingapuram New East South Wing,968,706,690,343,1,0,43,238,53,1,0,1,0,1,1,0,0,2,2,0,0,0,16,1,2,706,0
213,Panchayat Union Elementary School Narasingapuram North Middle Portion,851,345,724,0,20,0,719,0,0,1,2,0,27,5,0,0,0,0,0,0,1,0,3,314,3,724,0
214,Government Girls Higher Secondary School Attur West Room No.5,479,179,18,802,36,0,239,0,0,478,0,0,0,0,2,0,2,0,0,0,1,0,0,0,1,802,0
215,Government Girls Higher Secondary School Attur West Room No.6,182,43,426,0,0,166,0,0,28,0,0,423,0,0,0,0,1,642,0,0,0,3,0,1,1,426,0
216,Government Girls Higher Secondary School Attur Middle Wing Northern 3rd Room,836,150,35,0,462,33,0,0,1,236,0,0,2,0,0,0,1,1,0,0,0,7,469,2,0,462,0
217,Government Boys Higher Secondary School Attur North East wing Room No.24,935,26,0,42,0,0,257,0,0,0,0,0,2,0,13,267,0,0,598,0,1,1,1,1,257,258,0
218,Government Boys Higher Secondary School Attur North West Wing Room No 23,611,0,17,388,393,0,711,105,230,0,0,0,0,0,1,33,1,1,0,0,0,0,5,0,0,393,1
219,Government Boys Higher Secondary School Attur North East Wing,1126,38,28,0,613,150,1126,1,0,0,0,0,1,0,0,1,0,0,1,0,0,0,8,621,0,621,3
220,Government Boys Higher Secondary School Attur North West Wing,927,534,41,0,281,2,1,1,30,0,174,0,0,0,0,0,0,1,0,540,6,0,0,1,1,534,0
221,Government Boys Higher Secondary School Attur East South Wing Room No.38,872,5,1,22,27,0,2,21,0,0,0,0,0,254,1,86,1,1,1,1,22,400,0,409,0,409,9
222,Government Boys Higher Secondary School Attur East North wing Room No.40,204,0,0,3,0,0,0,0,54,0,0,29,14,1,0,101,0,103,2,0,0,0,0,0,0,103,0
223,Government Boys Higher Secondary School Attur NABARD North Room No.6,915,2,3,434,41,198,10,0,1,1,1,1,0,0,0,1,1,695,0,697,2,0,0,0,0,697,0
224,Government Boys Higher Secondary School Attur East Middle Portion Room No 39,843,2,0,371,0,278,0,5,0,0,0,1,0,1,2,40,0,0,6,3,1,710,0,713,3,713,0
225,Government Boys Higher Secondary School Attur New North Room No.2,911,0,0,0,316,1,0,16,0,33,1,0,1,0,0,124,0,0,0,1,1,1,495,0,500,500,0
226,Government Boys Higher Secondary School Attur New North Room No.4,755,59,0,341,0,0,0,1,0,221,2,0,1,0,0,0,0,0,1,2,0,8,0,636,9,645,0
227,Government Boys Higher Secondary School Attur New NABARD North Room No.8,1327,46,51,0,0,0,1,0,0,0,284,1,4,1,0,1,1,3,0,1,0,328,722,0,735,735,0
228,Government Boys Higher Secondary School Attur New NABARD North Room No.10,1189,84,0,1,0,288,368,57,2,3,0,1,0,4,1,1,1,0,3,4,2,3,465,823,0,830,0
229,Government Boys Higher Secondary School Attur New Terrced North Room No 3,1231,115,0,0,2,0,0,0,342,1,0,76,4,1,2,0,2,1,1,1,1,1014,0,1023,9,1023,0
230,Government Boys Higher Secondary School Attur New NABARD North West Room No.12,1163,441,0,0,0,24,1,2,1,0,1,0,385,122,2,0,1,3,2,1,2,1,0,0,65,993,0
231,Government High School Narasingapuram Terraced West Room No.2,1109,452,303,0,0,0,0,0,5,1,1,0,0,1,1,0,1,73,1,41,0,0,0,2,301,911,0
232,Panchayat Union Middle School Selliampalayam New North East Wing,780,1,4,0,0,282,1,2,0,0,0,3,1,1,3,1,118,0,0,0,59,1,0,0,0,648,0
233,Govt Higher Sec School Thandavarayapuram Nabard South East 2nd Room,505,180,0,0,0,0,0,2,30,1,1,393,0,0,0,0,0,0,0,0,0,0,0,0,0,398,0
234,Govt Higher Sec School Thandavarayapuram Nabard South West 3rd Room,847,0,57,0,0,0,0,0,0,238,0,1,326,0,0,2,46,1,0,1,2,1,675,8,0,683,0
235,Govt Higher Sec School Thandavarayapuram Nabard South West 2nd Room,648,225,0,24,0,0,0,196,0,0,0,37,0,0,0,0,4,2,0,0,0,1,489,0,495,495,0
236,Panchayat Union Elementary School Thandavarayapuram North East wing,693,7,207,305,6,2,0,0,0,0,5,1,0,0,0,0,0,35,1,1,1,1,572,6,0,578,0
237,Panchayat Union Elementary School Thandavarayapuram Northwest wing,1139,1,1,0,0,0,0,215,527,182,2,14,34,0,4,2,2,2,1,46,453,0,0,0,0,453,0
238,Panchayat Union Elementary School Chokkanathapuram West North Wing,1326,48,1,57,274,833,1,1,4,252,651,0,0,0,0,0,0,0,0,0,0,0,0,0,0,659,0
239,Panchayat Union Elementary School Chokkanathapuram West South Wing,946,2,94,25,693,176,2,2,0,1,241,2,0,0,1,0,0,1,1,3,551,4,0,0,0,555,0
240,Panchayat Union Elementary School Mottur Tiled South East Wing,983,93,0,983,1,2,318,274,2,0,0,79,0,0,4,0,0,0,0,0,1,1,775,0,0,775,0
241,Panchayat Union Elementary School Echampatti West North Wing,571,207,163,571,15,0,4,0,1,2,0,0,1,0,2,0,0,0,1,32,1,3,432,5,0,437,0
242,Panchayat Union Elementary School Echampatti West South Wing,652,34,1,234,0,0,33,0,1,0,0,0,2,652,213,0,2,1,2,0,0,1,53,2,524,529,0
243,Panchayat Union Elementary School Malliakarai Tiled East South Wing,769,246,0,0,769,0,3,0,1,0,0,0,0,37,0,1,240,0,1,1,585,4,0,0,0,589,0
244,Panchayat Union Elementary School Malliakarai Tiled East North wing,754,47,170,297,0,0,1,0,0,0,49,2,1,0,0,0,1,2,0,0,0,570,12,0,0,582,0
245,Panchayat Union Elementary School Malliakarai Tiled East South Wing,779,263,0,0,2,0,0,0,0,0,0,0,0,31,70,2,210,3,3,2,1,588,5,0,0,593,0
246,Panchayat Union Elementary School Malliakarai Tiled East North Wing,1148,21,320,2,2,422,3,3,2,0,0,68,0,0,3,1,1,0,3,7,1,859,7,0,0,866,0
247,Panchayat Union Elementary School Malliakarai Tiled East,957,53,231,363,0,41,0,1,0,1,0,0,2,2,2,6,0,3,1,3,1,710,12,0,0,722,0
248,Panchayat Union Middle School Govindarajapalayam SSA East North Wing,789,0,29,0,35,0,1,2,1,239,224,0,0,0,1,0,3,0,0,0,2,538,7,0,0,545,0
249,Panchayat Union Middle School Govindarajapalayam SSA East South Wing,821,58,254,223,2,1,0,0,35,1,0,3,0,1,3,2,2,0,0,1,1,587,8,0,0,595,0
250,Panchayat Union Middle School Govindarajapalayam West North Wing,546,0,0,0,1,4,54,1,48,0,2,0,1,2,3,0,1,775,1,1,537,9,0,0,0,546,0
251,Panchayat Union Middle School Govindarajapalayam west south wing,670,223,581,174,0,0,0,1,0,1,0,0,191,28,1,4,1,3,1,3,2,1,21,0,432,436,0
252,Panchayat Union Middle School Oorandivalasu SSA North middle Wing Room 1,505,151,41,0,2,3,0,0,4,0,263,0,31,2,6,505,1,0,0,0,0,0,0,0,0,506,0
253,Panchayat Union Middle School Oorandivalasu SSA North middle Wing Room 2,895,318,2,270,0,71,37,1,1,1,0,1,710,3,0,0,0,0,0,0,0,0,0,0,0,713,0
254,Panchayat Union Middle School Seeliampatti Terraced South West Wing,883,0,271,287,0,0,0,52,1,1,77,0,1,0,0,0,31,695,4,0,0,0,0,0,0,699,0
255,Panchayat Union Middle School Seeliampatti North Building West South Wing,596,35,286,231,743,0,0,1,0,1,1,1,587,9,0,0,0,0,0,0,0,0,0,0,0,596,0
256,Panchayat Union Middle School Seeliampatti South West North Wing,648,0,0,2,1,729,239,210,2,1,0,4,0,0,1,39,0,0,2,80,0,2,583,6,0,589,0
257,Panchayat Union Middle School Seeliampatti South West South Wing,944,0,0,28,0,0,33,0,0,295,401,2,2,0,0,0,0,3,0,2,2,768,4,0,0,772,0
258,Panchayat Union Elementary School Seeliampatti pudur East North Wing,1115,377,35,52,0,0,0,1,364,2,0,4,2,1,0,0,1,2,1,1,845,6,0,0,0,851,0
259,Govt Higher Secondary School Manjini New North West Wing Room 2,447,0,622,196,210,0,1,0,0,1,0,1,0,1,0,1,20,0,0,1,1,447,2,0,0,449,0
260,Govt Higher Secondary School Manjini New North East wing Room 1,596,189,0,26,17,0,0,0,0,0,0,0,0,222,0,0,2,1,0,1,2,460,2,0,0,462,0
261,Govt Higher Secondary School Manjini SSA South West Wing Room 24,1078,0,103,0,1,1,386,0,0,372,0,0,1,0,0,0,1,4,3,1,3,0,215,876,5,881,0
262,Govt Higher Secondary School Manjini SSA South East Wing,814,0,2,0,0,0,1,2,0,1,2,0,81,2,291,0,9,1,1,0,0,205,0,1,188,609,0
263,Panchayat Union Middle School Pungavadi North West Wing,1078,1,4,0,4,0,0,0,27,0,44,663,1,1,55,671,0,0,0,250,175,0,60,2,476,478,0
264,Panchayat Union Middle School Pungavadi East South wing,814,1,0,2,0,0,2,1,0,0,2,2,0,225,722,0,0,0,59,2,0,25,0,0,0,557,0
265,Panchayat Union Middle School Pungavadi West North Wing,1078,1,226,1,1,1,2,901,315,287,0,48,0,1,0,0,31,1,0,0,0,0,2,2,2,545,0
266,Panchayat Union Middle School Pungavadi SSA east middle Wing,814,697,0,0,15,0,21,0,229,220,1,0,0,0,0,0,0,0,1,2,1,2,692,6,0,698,0
267,Govt Higher Secondary School Keeripatti South West Wing,1078,2,711,38,53,207,0,2,0,1,0,0,0,0,0,0,0,0,0,229,1,1,492,3,0,495,0
268,Govt Higher Secondary School Keeripatti East,814,2,7,2,2,0,0,490,1326,1,94,1,0,69,1,0,1,2,1,1,336,534,5,0,0,539,0
269,Govt Higher Secondary School Keeripatti SSA East North wing Room 1,901,1,94,1,0,69,1,0,1,2,1,1,336,1012,6,0,0,0,0,0,0,0,0,0,0,1018,0
270,Govt Higher Secondary School Keeripatti West East Building Middle Wing,711,3,2,3,2,0,1409,0,0,72,1,0,2,78,4,476,284,4,1,932,14,0,0,0,0,946,0
271,Govt Higher Secondary School Keeripatti East North Wing Room No.3,1326,660,0,206,161,2,0,0,2,0,0,0,28,0,83,1,2,1,1,487,6,0,0,0,0,493,0
272,Govt Higher Secondary School Keeripatti East North Wing Room No.2,1409,857,69,0,0,33,0,0,0,1,0,0,243,213,2,3,1,0,0,0,0,0,572,7,0,579,0
273,Govt Higher Secondary School Keeripatti North West Wing,660,1234,505,62,0,5,2,0,2,2,273,4,71,3,0,0,4,0,0,3,1,2,1,940,9,949,0
274,Govt Higher Secondary School Keeripatti North South Building East Room 44,857,1,0,0,0,0,1,0,0,214,290,1,8,42,0,0,0,0,0,0,1,1,561,2,0,563,0
275,Panchayat Union Elementary School Keeripatti Facing North,1234,22,4,0,0,548,134,245,0,0,0,0,0,1,0,0,0,23,1,0,0,2,0,432,6,438,0
276,Govt High School Nainarpalayam Paithur North SSA East wing,688,368,44,0,3,24,4,0,0,0,0,0,1,1,1,4,272,0,0,0,2,1,725,4,0,729,0
277,Panchayat Union Elementary School Nainarpalayam New SSA Facing North,22,406,40,0,4,4,0,0,0,0,2,7,4,0,1,264,3,1,2,3,3,51,0,9,745,748,0
278,Panchayat Union Elementary School Nainarpalayam SSA South West wing,968,776,382,0,2,3,5,1,4,3,1,2,6,5,0,192,2,3,1,1,673,0,0,0,0,673,0
279,Panchayat Union Elementary School Paithur North Tiled South,922,0,892,0,1,0,23,41,0,7,4,0,0,1,0,0,2,7,0,400,283,1,2,772,3,775,0
280,Panchayat Union Elementary School Paithur North Terraced Facing East,745,245,27,0,50,407,4,0,1,0,1,0,0,0,0,1,0,0,2,1,0,3,742,2,0,744,0
281,Panchayat Union Elementary School Paithurpudur West North Wing,892,0,215,558,0,5,0,0,0,0,0,38,186,0,0,4,0,0,0,1,3,1,5,458,2,460,0
282,Panchayat Union Middle School Koolamedu North West wing,917,279,0,271,0,0,29,14,0,7,3,2,4,0,0,3,1,0,0,3,1,1,618,6,0,624,0"""

def main():
    ac_id = "TN-082"
    
    # Load existing data
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    with open(results_file) as f:
        data = json.load(f)
    
    existing_count = len(data.get('results', {}))
    
    # Parse CSV
    reader = csv.DictReader(io.StringIO(csv_data))
    
    new_results = {}
    
    for row in reader:
        try:
            booth_no = int(row['Station No'])
        except:
            continue
            
        booth_id = f"{ac_id}-{booth_no:03d}"
        
        # Extract votes for each candidate (C1-C23)
        votes = []
        for i in range(1, 24):
            col_name = f'C{i}'
            try:
                votes.append(int(row.get(col_name, 0)))
            except:
                votes.append(0)
        
        # Get NOTA
        try:
            nota = int(row.get('NOTA', 0))
        except:
            nota = 0
        votes.append(nota)
        
        try:
            total = int(row.get('Total Valid', sum(votes)))
        except:
            total = sum(votes)
        
        new_results[booth_id] = {
            'votes': votes,
            'total': total,
            'rejected': 0
        }
    
    # Merge with existing
    added = 0
    for booth_id, result in new_results.items():
        if booth_id not in data['results']:
            data['results'][booth_id] = result
            added += 1
    
    data['totalBooths'] = len(data['results'])
    data['source'] = data.get('source', '') + ' (manual CSV import)'
    
    # Save
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    new_count = len(data['results'])
    print(f"AC082: {existing_count} -> {new_count} booths (+{added} new)")
    print(f"CSV had {len(new_results)} rows")

if __name__ == "__main__":
    main()
