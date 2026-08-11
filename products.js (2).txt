/* ---------------- DATA ---------------- */

const CATEGORIES = ["trainers","heels","boots","sandals","flats","wedges","dresses","sunglasses","tops","shorts","trousers"];

// The six shoe-type categories, grouped — used for the "what kind of shoe?" question
// when someone types "shoes" without saying which kind (Session 7).
const SHOE_CATEGORIES = ["trainers","heels","boots","sandals","flats","wedges"];

// Any shoe category can pair with a dress/top/etc in "Build the Look" — this list
// replaces the old single "shoes" category reference everywhere it was used.
const ALL_SHOE_CATEGORIES = SHOE_CATEGORIES;

const STYLE_WORDS = ["trendy","casual","party","sporty","smart","cute","comfy","edgy","classic","summer","school","festival"];

const PRODUCTS = [
  // TRAINERS (was "shoes" — same 4 products, new category name)
  {cat:"trainers", name:"Adidas Superstar", sizes:[3,4,5,6,7,8], price:100, style:["trendy","casual"], pairsWith:["tops","shorts"], link:"https://www.adidas.com/us/superstar-ii-shoes/JH7033.html"},
  {cat:"trainers", name:"Isabel Marant Bekett Sneakers - Ecru", sizes:[3,4,5,6,7,8], price:850, style:["trendy","edgy"], pairsWith:["tops","shorts"], link:"https://us.isabelmarant.com/products/bk0010faa1e19s23ec-bekett-sneakers-ecru"},
  {cat:"trainers", name:"Hoka Clifton 10 Running Shoes", sizes:[4,5,6,7,8], price:155, style:["sporty","comfy"], pairsWith:["tops","shorts"], link:"https://www.dickssportinggoods.com/p/hoka-womens-clifton-10-running-shoes-25fhqwclftn10blckftw/25fhqwclftn10blckftw"},
  {cat:"trainers", name:"Vans Old Skool", sizes:[3,4,5,6,7,8], price:65, style:["casual","edgy"], pairsWith:["tops","shorts"], link:"https://www.vans.com/en-us/p/shoes/icons/old-skool-5205/old-skool-shoe-VN000D3HY28"},

  // FLATS (Dr Martens Oxford moved here from "shoes" + new addition)
  {cat:"flats", name:"Dr. Martens 1461 Smooth Leather Oxford Shoes", sizes:[3,4,5,6,7,8], price:130, style:["edgy","classic"], pairsWith:["tops","trousers"], link:"https://www.drmartens.com/uk/en_gb/1461-smooth-leather-oxford-shoes-black/p/11838002"},

  // HEELS (NEW — Session 7)
  {cat:"heels", name:"ASOS DESIGN Hotel Barely There Block Heeled Sandals - Gold", sizes:[3,4,5,6,7,8], price:44.99, style:["party","trendy"], pairsWith:["dresses","tops"], link:"https://www.asos.com/us/asos-design/asos-design-hotel-barely-there-block-heeled-sandals-in-gold/prd/205907517"},

  // BOOTS (NEW — Session 7)
  // Price is an estimate from resale/retail listings, not fetched from ugg.com directly — flag to verify, like the other estimated prices.
  {cat:"boots", name:"UGG Classic Mini II Boot - Chestnut", sizes:[3,4,5,6,7,8], price:150, style:["comfy","casual"], pairsWith:["tops","trousers"], link:"https://www.ugg.com/women-boots/classic-mini-ii/1016222.html"},

  // SANDALS (NEW — Session 7)
  {cat:"sandals", name:"Birkenstock Arizona Birko-Flor Sandals", sizes:[3,4,5,6,7,8], price:117.95, style:["summer","casual","comfy"], pairsWith:["tops","shorts"], link:"https://www.birkenstock.com/us/arizona-birko-flor/arizona-core-birkoflor-0-eva-u_73.html"},

  // WEDGES (NEW — Session 7)
  // Price is an estimate from retail listings, not fetched from toms.com directly — flag to verify.
  {cat:"wedges", name:"TOMS Diana Natural Wedge Sandal", sizes:[3,4,5,6,7,8], price:79.99, style:["summer","smart"], pairsWith:["dresses","shorts"], link:"https://www.toms.com/en-us/products/diana-natural-wedge-sandal"},

  // DRESSES
  {cat:"dresses", name:"Boho Halter V-Neck Open Back Maxi Dress", sizes:[8,10,12,14,16], price:79.95, style:["summer","cute","festival"], pairsWith:ALL_SHOE_CATEGORIES, link:"https://bohobeachhut.com/products/boho-halter-v-neck-open-back-maxi-dress"},
  {cat:"dresses", name:"Oh Polly Leya A-Line Mini Dress - Black", sizes:[6,8,10,12], price:62, style:["party","trendy"], pairsWith:ALL_SHOE_CATEGORIES, link:"https://us.ohpolly.com/products/leya-a-line-mini-dress-black"},
  {cat:"dresses", name:"Eterne Long Sleeve Crewneck Maxi Dress - Black", sizes:[6,8,10,12,14], price:265, style:["classic","smart"], pairsWith:ALL_SHOE_CATEGORIES, link:"https://www.revolve.com/eterne-long-sleeve-crewneck-maxi-dress-in-black/dp/ERNE-WD2/"},
  {cat:"dresses", name:"Zara Fitted Wrap Dress - Black", sizes:[6,8,10,12,14,16], price:49.90, style:["smart","party"], pairsWith:ALL_SHOE_CATEGORIES, link:"https://www.zara.com/us/en/fitted-wrap-dress-p01165462.html"},
  {cat:"dresses", name:"ASOS DESIGN Square Neck Midi Dress - Floral", sizes:[6,8,10,12,14], price:64.99, style:["summer","cute","school"], pairsWith:ALL_SHOE_CATEGORIES, link:"https://www.asos.com/us/asos-design/asos-design-square-neck-midi-dress-in-floral-print/prd/209150878"},

  // SUNGLASSES
  {cat:"sunglasses", name:"Greenwich Social Club Canouan - Black", sizes:["one size"], price:165, style:["trendy","edgy"], pairsWith:[], link:"https://greenwichsocialclub.com/products/canouan-black"},
  {cat:"sunglasses", name:"Maui Jim Hau'oli XS Aviator", sizes:["one size"], price:229, style:["classic","smart"], pairsWith:[], link:"https://www.mauijim.com/US/en_US/shop/sunglasses/aviators/hauoli-xs"},
  {cat:"sunglasses", name:"Maui Jim Hiluhilu", sizes:["one size"], price:309, style:["trendy","festival"], pairsWith:[], link:"https://www.mauijim.com/US/en_US/shop/sunglasses/fashion/hiluhilu"},
  {cat:"sunglasses", name:"Ray-Ban New Wayfarer Classic", sizes:["one size"], price:163, style:["classic","casual"], pairsWith:[], link:"https://www.ray-ban.com/usa/sunglasses/RB2132new%20wayfarer%20classic-black/805289048527"},
  {cat:"sunglasses", name:"Quay High Key", sizes:["one size"], price:85, style:["trendy","festival"], pairsWith:[], link:"https://www.quay.com/products/high-key"},

  // TOPS
  {cat:"tops", name:"With Jean Lana Top - Stone", sizes:[6,8,10], price:148, style:["casual","cute"], pairsWith:["shorts","trousers"], link:"https://withjean.com/products/lana-top-stone"},
  {cat:"tops", name:"Reformation Lois Knit Top", sizes:[6,8,10,12], price:88, style:["party","trendy"], pairsWith:["trousers"], link:"https://www.thereformation.com/products/lois-knit-top/1319850PRI.html"},
  {cat:"tops", name:"Kookai Ariel Lace Top - Black", sizes:[6,8,10,12], price:120, style:["party","edgy"], pairsWith:["trousers","shorts"], link:"https://www.kookai.us/products/ariel-lace-top-black"},
  {cat:"tops", name:"H&M Ribbed Crop Top - Beige", sizes:[6,8,10,12,14,16], price:6.99, style:["casual","school","comfy"], pairsWith:["shorts","trousers"], link:"https://www2.hm.com/en_us/productpage.0966285001.html"},
  {cat:"tops", name:"Zara Satin Lace Camisole Top - Ecru", sizes:[6,8,10,12,14], price:29.90, style:["party","trendy"], pairsWith:["trousers"], link:"https://www.zara.com/us/en/satin-lace-lingerie-style-top-p05344110.html"},

  // SHORTS
  {cat:"shorts", name:"Revice Denim Low Rider - South Beach", sizes:[6,8,10,12], price:78, style:["trendy","summer"], pairsWith:["tops"], link:"https://www.revicedenim.com/products/low-rider-south-beach"},
  {cat:"shorts", name:"Isabel Marant Eneidao Fringed Denim Shorts", sizes:[8,10,12,14], price:310, style:["trendy","edgy"], pairsWith:["tops"], link:"https://www.net-a-porter.com/en-us/shop/product/isabel-marant/clothing/short-and-mini/eneidao-fringed-denim-shorts/1647597325950548"},
  {cat:"shorts", name:"Out From Under Free Kick Mesh Micro Shorts", sizes:[8,10,12,14,16], price:19, style:["casual","summer"], pairsWith:["tops"], link:"https://www.urbanoutfitters.com/shop/out-from-under-free-kick-mesh-micro-shorts"},
  {cat:"shorts", name:"Nike Dri-FIT Tempo Running Shorts", sizes:[6,8,10,12,14,16], price:32, style:["sporty","comfy"], pairsWith:["tops"], link:"https://www.dickssportinggoods.com/f/shop-womens-nike-running-shorts"},
  {cat:"shorts", name:"Topshop Denim Shorts - Mid Blue", sizes:[6,8,10,12], price:45, style:["casual","trendy","summer"], pairsWith:["tops"], link:"https://www.asos.com/us/topshop/topshop-denim-shorts-in-mid-blue/prd/207460391"},

  // TROUSERS
  {cat:"trousers", name:"New Look Petite Black Tailored Pull-On Trousers", sizes:[6,8,10,12,14], price:32, style:["smart","classic","school"], pairsWith:["tops"], link:"https://www.newlook.com/uk/womens/clothing/trousers/petite-black-tailored-pull-on-trousers/p/932715001"},
  {cat:"trousers", name:"Lululemon Daydrift High-Rise Straight-Leg Trouser", sizes:[6,8,10,12,14], price:148, style:["smart","comfy"], pairsWith:["tops"], link:"https://www.lululemon.co.uk/en-gb/p/daydrift-high-rise-straight-leg-trouser-regular/157686489.html"},
  {cat:"trousers", name:"Roman Wide Leg Stretch Trousers - Khaki", sizes:[10,12,14,16,18], price:33, style:["casual","classic"], pairsWith:["tops"], link:"https://www.roman.co.uk/wide-leg-stretch-trousers-18000740"},
  {cat:"trousers", name:"Zara High-Waisted Wide-Leg Pants - Striped", sizes:[6,8,10,12,14,16], price:59.90, style:["smart","trendy"], pairsWith:["tops"], link:"https://www.zara.com/us/en/high-waisted-wide-leg-pants-p04387293.html"},
  {cat:"trousers", name:"Nike Sportswear Club Fleece Joggers", sizes:[6,8,10,12,14,16,18], price:65, style:["sporty","comfy","casual"], pairsWith:["tops"], link:"https://www.dickssportinggoods.com/p/nike-sportswear-womens-club-fleece-mid-rise-joggers-23nikwclbflcmrjggapb/23nikwclbflcmrjggapb"}
];
