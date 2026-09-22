import type { StationItem } from '../api/types';

export const INITIAL_GQ_STATIONS: StationItem[] = [
  {
    "code": "NDLS",
    "name": "NEW DELHI",
    "lon": 77.22,
    "lat": 28.6423,
    "legs": [
      "WEST",
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "FDB",
      "GZB"
    ]
  },
  {
    "code": "FDB",
    "name": "FARIDABAD",
    "lon": 77.3073,
    "lat": 28.4115,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "NDLS",
      "PWL"
    ]
  },
  {
    "code": "PWL",
    "name": "PALWAL",
    "lon": 77.3422,
    "lat": 28.1518,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "FDB",
      "KSV"
    ]
  },
  {
    "code": "KSV",
    "name": "KOSI KALAN",
    "lon": 77.446,
    "lat": 27.7886,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "PWL",
      "MTJ"
    ]
  },
  {
    "code": "MTJ",
    "name": "MATHURA JN",
    "lon": 77.6731,
    "lat": 27.4801,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "KSV",
      "BTE"
    ]
  },
  {
    "code": "BTE",
    "name": "BHARATPUR JN",
    "lon": 77.4886,
    "lat": 27.2371,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "MTJ",
      "BXN"
    ]
  },
  {
    "code": "BXN",
    "name": "BAYANA JN",
    "lon": 77.2971,
    "lat": 26.9164,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "BTE",
      "HAN"
    ]
  },
  {
    "code": "HAN",
    "name": "HINDAUN CITY",
    "lon": 77.0317,
    "lat": 26.7562,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "BXN",
      "GGC"
    ]
  },
  {
    "code": "GGC",
    "name": "GANGAPUR CITY",
    "lon": 76.7277,
    "lat": 26.469,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "HAN",
      "SWM"
    ]
  },
  {
    "code": "SWM",
    "name": "SAWAI MADHOPUR",
    "lon": 76.3562,
    "lat": 26.0183,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "GGC",
      "KOTA"
    ]
  },
  {
    "code": "KOTA",
    "name": "KOTA JN",
    "lon": 75.8805,
    "lat": 25.2236,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "SWM",
      "RMA"
    ]
  },
  {
    "code": "RMA",
    "name": "RAMGANJ MANDI",
    "lon": 75.9394,
    "lat": 24.6446,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "KOTA",
      "BWM"
    ]
  },
  {
    "code": "BWM",
    "name": "BHAWANI MANDI",
    "lon": 75.8298,
    "lat": 24.4195,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "RMA",
      "SGZ"
    ]
  },
  {
    "code": "SGZ",
    "name": "SHAMGARH",
    "lon": 75.6428,
    "lat": 24.1911,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "BWM",
      "NAD"
    ]
  },
  {
    "code": "NAD",
    "name": "NAGDA JN",
    "lon": 75.4125,
    "lat": 23.4559,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "SGZ",
      "RTM"
    ]
  },
  {
    "code": "RTM",
    "name": "RATLAM JN",
    "lon": 75.0508,
    "lat": 23.3404,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "NAD",
      "DHD"
    ]
  },
  {
    "code": "DHD",
    "name": "DAHOD",
    "lon": 74.2534,
    "lat": 22.8436,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "RTM",
      "GDA"
    ]
  },
  {
    "code": "GDA",
    "name": "GODHRA JN",
    "lon": 73.6037,
    "lat": 22.777,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "DHD",
      "BRC"
    ]
  },
  {
    "code": "BRC",
    "name": "VADODARA JN",
    "lon": 73.1811,
    "lat": 22.3108,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "GDA",
      "MYG"
    ]
  },
  {
    "code": "MYG",
    "name": "MIYAGAM KARJAN",
    "lon": 73.1204,
    "lat": 22.0507,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "BRC",
      "BH"
    ]
  },
  {
    "code": "BH",
    "name": "BHARUCH JN",
    "lon": 72.9977,
    "lat": 21.7069,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "MYG",
      "AKV"
    ]
  },
  {
    "code": "AKV",
    "name": "ANKLESHWAR JN",
    "lon": 73.0006,
    "lat": 21.6239,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "BH",
      "KSB"
    ]
  },
  {
    "code": "KSB",
    "name": "KOSAMBA JN",
    "lon": 72.9546,
    "lat": 21.4641,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "AKV",
      "ST"
    ]
  },
  {
    "code": "ST",
    "name": "SURAT",
    "lon": 72.8408,
    "lat": 21.2066,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "KSB",
      "NVS"
    ]
  },
  {
    "code": "NVS",
    "name": "NAVSARI",
    "lon": 72.9143,
    "lat": 20.9469,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "ST",
      "BIM"
    ]
  },
  {
    "code": "BIM",
    "name": "BILIMORA JN",
    "lon": 72.9705,
    "lat": 20.7633,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "NVS",
      "BL"
    ]
  },
  {
    "code": "BL",
    "name": "VALSAD",
    "lon": 72.9335,
    "lat": 20.6086,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "BIM",
      "VAPI"
    ]
  },
  {
    "code": "VAPI",
    "name": "VAPI",
    "lon": 72.9091,
    "lat": 20.3743,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "BL",
      "DRD"
    ]
  },
  {
    "code": "DRD",
    "name": "DAHANU ROAD",
    "lon": 72.7434,
    "lat": 19.9912,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "VAPI",
      "PLG"
    ]
  },
  {
    "code": "PLG",
    "name": "PALGHAR",
    "lon": 72.7725,
    "lat": 19.698,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "DRD",
      "VR"
    ]
  },
  {
    "code": "VR",
    "name": "VIRAR",
    "lon": 72.8117,
    "lat": 19.4544,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "PLG",
      "BSR"
    ]
  },
  {
    "code": "BSR",
    "name": "VASAI ROAD",
    "lon": 72.8322,
    "lat": 19.3824,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "VR",
      "BVI"
    ]
  },
  {
    "code": "BVI",
    "name": "BORIVALI",
    "lon": 72.8564,
    "lat": 19.2287,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "BSR",
      "DDR"
    ]
  },
  {
    "code": "DDR",
    "name": "MUMBAI DADAR WEST",
    "lon": 72.8435,
    "lat": 19.0197,
    "legs": [
      "WEST"
    ],
    "adjacentCodes": [
      "BVI",
      "BCT"
    ]
  },
  {
    "code": "BCT",
    "name": "Mumbai Central",
    "lon": 72.8194,
    "lat": 18.9707,
    "legs": [
      "WEST",
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "DDR",
      "KYN"
    ]
  },
  {
    "code": "KYN",
    "name": "KALYAN JN",
    "lon": 73.1297,
    "lat": 19.2347,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "BCT",
      "LNL"
    ]
  },
  {
    "code": "LNL",
    "name": "LONAVALA",
    "lon": 73.4077,
    "lat": 18.7489,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "KYN",
      "PUNE"
    ]
  },
  {
    "code": "PUNE",
    "name": "PUNE JN",
    "lon": 73.8731,
    "lat": 18.5294,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "LNL",
      "DD"
    ]
  },
  {
    "code": "DD",
    "name": "DAUND JN",
    "lon": 74.5786,
    "lat": 18.4635,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "PUNE",
      "KWV"
    ]
  },
  {
    "code": "KWV",
    "name": "KURDUVADI",
    "lon": 75.4171,
    "lat": 18.0913,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "DD",
      "SUR"
    ]
  },
  {
    "code": "SUR",
    "name": "SOLAPUR JN",
    "lon": 75.8934,
    "lat": 17.6645,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "KWV",
      "GR"
    ]
  },
  {
    "code": "GR",
    "name": "GULBARGA",
    "lon": 76.8244,
    "lat": 17.3144,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "SUR",
      "WADI"
    ]
  },
  {
    "code": "WADI",
    "name": "WADI",
    "lon": 76.9915,
    "lat": 17.0543,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "GR",
      "YG"
    ]
  },
  {
    "code": "YG",
    "name": "YADGIR",
    "lon": 77.1304,
    "lat": 16.7444,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "WADI",
      "RC"
    ]
  },
  {
    "code": "RC",
    "name": "RAICHUR",
    "lon": 77.3392,
    "lat": 16.1924,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "YG",
      "MALM"
    ]
  },
  {
    "code": "MALM",
    "name": "MANTHRALAYAM RD",
    "lon": 77.2992,
    "lat": 15.949,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "RC",
      "AD"
    ]
  },
  {
    "code": "AD",
    "name": "ADONI",
    "lon": 77.2749,
    "lat": 15.617,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "MALM",
      "GTL"
    ]
  },
  {
    "code": "GTL",
    "name": "GUNTAKAL JN",
    "lon": 77.3666,
    "lat": 15.1756,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "AD",
      "GY"
    ]
  },
  {
    "code": "GY",
    "name": "GOOTY JN",
    "lon": 77.6258,
    "lat": 15.1492,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "GTL",
      "YA"
    ]
  },
  {
    "code": "YA",
    "name": "YERRAGUNTLA",
    "lon": 78.534,
    "lat": 14.6423,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "GY",
      "HX"
    ]
  },
  {
    "code": "HX",
    "name": "CUDDAPAH",
    "lon": 78.8292,
    "lat": 14.4517,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "YA",
      "RU"
    ]
  },
  {
    "code": "RU",
    "name": "RENIGUNTA JN",
    "lon": 79.5063,
    "lat": 13.6363,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "HX",
      "AJJ"
    ]
  },
  {
    "code": "AJJ",
    "name": "ARAKKONAM",
    "lon": 79.668,
    "lat": 13.0815,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "RU",
      "PER"
    ]
  },
  {
    "code": "PER",
    "name": "PERAMBUR",
    "lon": 80.2445,
    "lat": 13.107,
    "legs": [
      "SOUTH_WEST"
    ],
    "adjacentCodes": [
      "AJJ",
      "MAS"
    ]
  },
  {
    "code": "MAS",
    "name": "CHENNAI CENTRAL",
    "lon": 80.2749,
    "lat": 13.0848,
    "legs": [
      "SOUTH_WEST",
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "PER",
      "SPE"
    ]
  },
  {
    "code": "SPE",
    "name": "SULLURUPETA",
    "lon": 80.0182,
    "lat": 13.6965,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "MAS",
      "GDR"
    ]
  },
  {
    "code": "GDR",
    "name": "GUDUR JN",
    "lon": 79.8451,
    "lat": 14.1482,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "SPE",
      "NLR"
    ]
  },
  {
    "code": "NLR",
    "name": "NELLORE",
    "lon": 79.9894,
    "lat": 14.4606,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "GDR",
      "OGL"
    ]
  },
  {
    "code": "OGL",
    "name": "ONGOLE",
    "lon": 80.0574,
    "lat": 15.4981,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "NLR",
      "CLX"
    ]
  },
  {
    "code": "CLX",
    "name": "CHIRALA",
    "lon": 80.3536,
    "lat": 15.8308,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "OGL",
      "TEL"
    ]
  },
  {
    "code": "TEL",
    "name": "TENALI JN",
    "lon": 80.6404,
    "lat": 16.2424,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "CLX",
      "BZA"
    ]
  },
  {
    "code": "BZA",
    "name": "VIJAYAWADA JN",
    "lon": 80.6186,
    "lat": 16.5183,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "TEL",
      "EE"
    ]
  },
  {
    "code": "EE",
    "name": "ELURU",
    "lon": 81.1198,
    "lat": 16.7178,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "BZA",
      "TDD"
    ]
  },
  {
    "code": "TDD",
    "name": "TADEPALLIGUDEM",
    "lon": 81.5263,
    "lat": 16.81,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "EE",
      "RJY"
    ]
  },
  {
    "code": "RJY",
    "name": "RAJAMUNDRY",
    "lon": 81.7839,
    "lat": 16.9842,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "TDD",
      "SLO"
    ]
  },
  {
    "code": "SLO",
    "name": "SAMALKOT JN",
    "lon": 82.1687,
    "lat": 17.0448,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "RJY",
      "TUNI"
    ]
  },
  {
    "code": "TUNI",
    "name": "TUNI",
    "lon": 82.5425,
    "lat": 17.3611,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "SLO",
      "AKP"
    ]
  },
  {
    "code": "AKP",
    "name": "ANAKAPALLE",
    "lon": 83.0089,
    "lat": 17.6955,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "TUNI",
      "DVD"
    ]
  },
  {
    "code": "DVD",
    "name": "DUVVADA",
    "lon": 83.1521,
    "lat": 17.7038,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "AKP",
      "VSKP"
    ]
  },
  {
    "code": "VSKP",
    "name": "VISHAKAPATNAM",
    "lon": 83.2895,
    "lat": 17.7216,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "DVD",
      "VZM"
    ]
  },
  {
    "code": "VZM",
    "name": "VIZIANAGRAM JN",
    "lon": 83.3956,
    "lat": 18.1114,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "VSKP",
      "CHE"
    ]
  },
  {
    "code": "CHE",
    "name": "SRIKAKULAM ROAD",
    "lon": 83.9038,
    "lat": 18.4087,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "VZM",
      "PSA"
    ]
  },
  {
    "code": "PSA",
    "name": "PALASA",
    "lon": 84.4221,
    "lat": 18.7568,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "CHE",
      "BAM"
    ]
  },
  {
    "code": "BAM",
    "name": "BRAHMAPUR",
    "lon": 84.7967,
    "lat": 19.2961,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "PSA",
      "BALU"
    ]
  },
  {
    "code": "BALU",
    "name": "BALUGAON",
    "lon": 85.201,
    "lat": 19.7474,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "BAM",
      "KUR"
    ]
  },
  {
    "code": "KUR",
    "name": "KHURDA ROAD JN",
    "lon": 85.7082,
    "lat": 20.1531,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "BALU",
      "BBS"
    ]
  },
  {
    "code": "BBS",
    "name": "BHUBANESWAR",
    "lon": 85.8426,
    "lat": 20.2654,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "KUR",
      "CTC"
    ]
  },
  {
    "code": "CTC",
    "name": "CUTTACK",
    "lon": 85.9016,
    "lat": 20.4666,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "BBS",
      "JJKR"
    ]
  },
  {
    "code": "JJKR",
    "name": "JAJPUR KEONJHAR ROAD",
    "lon": 86.1325,
    "lat": 20.9435,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "CTC",
      "BHC"
    ]
  },
  {
    "code": "BHC",
    "name": "BHADRAKH",
    "lon": 86.5162,
    "lat": 21.0917,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "JJKR",
      "BLS"
    ]
  },
  {
    "code": "BLS",
    "name": "BALASORE",
    "lon": 86.9196,
    "lat": 21.5005,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "BHC",
      "KGP"
    ]
  },
  {
    "code": "KGP",
    "name": "KHARAGPUR JN",
    "lon": 87.3285,
    "lat": 22.3414,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "BLS",
      "SRC"
    ]
  },
  {
    "code": "SRC",
    "name": "SANTRAGACHI JN",
    "lon": 88.284,
    "lat": 22.5839,
    "legs": [
      "EAST_COAST"
    ],
    "adjacentCodes": [
      "KGP",
      "HWH"
    ]
  },
  {
    "code": "HWH",
    "name": "HOWRAH JN",
    "lon": 88.341,
    "lat": 22.5841,
    "legs": [
      "EAST_COAST",
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "SRC",
      "BWN"
    ]
  },
  {
    "code": "BWN",
    "name": "BARDDHAMAN JN",
    "lon": 87.8703,
    "lat": 23.2497,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "HWH",
      "DGR"
    ]
  },
  {
    "code": "DGR",
    "name": "DURGAPUR",
    "lon": 87.2979,
    "lat": 23.495,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "BWN",
      "ASN"
    ]
  },
  {
    "code": "ASN",
    "name": "ASANSOL JN",
    "lon": 86.9752,
    "lat": 23.6914,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "DGR",
      "DHN"
    ]
  },
  {
    "code": "DHN",
    "name": "DHANBAD JN",
    "lon": 86.429,
    "lat": 23.791,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "ASN",
      "GAYA"
    ]
  },
  {
    "code": "GAYA",
    "name": "GAYA JN",
    "lon": 84.9993,
    "lat": 24.804,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "DHN",
      "MGS"
    ]
  },
  {
    "code": "MGS",
    "name": "MUGHAL SARAI JN",
    "lon": 83.1193,
    "lat": 25.2781,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "GAYA",
      "MZP"
    ]
  },
  {
    "code": "MZP",
    "name": "MIRZAPUR",
    "lon": 82.5699,
    "lat": 25.1344,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "MGS",
      "ALD"
    ]
  },
  {
    "code": "ALD",
    "name": "ALLAHABAD JN",
    "lon": 81.8288,
    "lat": 25.4462,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "MZP",
      "FTP"
    ]
  },
  {
    "code": "FTP",
    "name": "FATEHPUR",
    "lon": 80.8019,
    "lat": 25.9175,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "ALD",
      "CNB"
    ]
  },
  {
    "code": "CNB",
    "name": "KANPUR CENTRAL",
    "lon": 80.351,
    "lat": 26.4542,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "FTP",
      "ETW"
    ]
  },
  {
    "code": "ETW",
    "name": "ETAWAH",
    "lon": 79.0215,
    "lat": 26.786,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "CNB",
      "SKB"
    ]
  },
  {
    "code": "SKB",
    "name": "SHIKOHABAD JN",
    "lon": 78.575,
    "lat": 27.0857,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "ETW",
      "TDL"
    ]
  },
  {
    "code": "TDL",
    "name": "TUNDLA JN",
    "lon": 78.2333,
    "lat": 27.2077,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "SKB",
      "ALJN"
    ]
  },
  {
    "code": "ALJN",
    "name": "ALIGARH JN",
    "lon": 78.0746,
    "lat": 27.8896,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "TDL",
      "KRJ"
    ]
  },
  {
    "code": "KRJ",
    "name": "KHURJA JN",
    "lon": 77.819,
    "lat": 28.2064,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "ALJN",
      "GZB"
    ]
  },
  {
    "code": "GZB",
    "name": "GHAZIABAD",
    "lon": 77.4311,
    "lat": 28.6497,
    "legs": [
      "NORTH_EAST"
    ],
    "adjacentCodes": [
      "KRJ",
      "NDLS"
    ]
  }
];
