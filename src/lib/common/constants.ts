import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import type { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import type { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { DatabaseBackend } from './settings.js';

export const ItemType = {
	Text: 'Text',
	Code: 'Code',
	Image: 'Image',
	File: 'File',
	Files: 'Files',
	Link: 'Link',
	Character: 'Character',
	Color: 'Color',
} as const;

export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export const ItemTypes = [
	ItemType.Text,
	ItemType.Code,
	ItemType.Image,
	ItemType.File,
	ItemType.Files,
	ItemType.Link,
	ItemType.Character,
	ItemType.Color,
] as const;

export const Tag = {
	Blue: 'blue',
	Teal: 'teal',
	Green: 'green',
	Yellow: 'yellow',
	Orange: 'orange',
	Red: 'red',
	Pink: 'pink',
	Purple: 'purple',
	Slate: 'slate',
} as const;

export type Tag = (typeof Tag)[keyof typeof Tag];

export const Tags = [
	Tag.Blue,
	Tag.Teal,
	Tag.Green,
	Tag.Yellow,
	Tag.Orange,
	Tag.Red,
	Tag.Pink,
	Tag.Purple,
	Tag.Slate,
] as const;

export const ActiveState = {
	None: 0,
	Focus: 1,
	Hover: 2,
	FocusHover: 3,
	Active: 4,
} as const;

export type ActiveState = (typeof ActiveState)[keyof typeof ActiveState];

export const DefaultColors = {
	'custom-bg-color': ['rgb(54,54,58)', 'rgb(250,250,251)'],
	'custom-fg-color': ['rgb(255,255,255)', 'rgb(34,34,38)'],
	'custom-card-bg-color': ['rgb(71,71,76)', 'rgb(255,255,255)'],
	'custom-search-bg-color': ['rgb(71,71,76)', 'rgb(255,255,255)'],
} as const;

export const UserAgent = 'Mozilla/5.0 (compatible; CopyousBot/1.0; +https://github.com/boerdereinar/copyous)';

export const HljsCdns = [
	'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.12.0/es',
	'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.12.0/build/es',
	'https://unpkg.com/@highlightjs/cdn-assets@11.12.0/es',
];

export const HljsUrls = HljsCdns.map((cdn) => `${cdn}/highlight.min.js`);

export const HljsSha512 =
	'0f52cec7982aa29f981dbd89d5886ebd0d88985e80b601667df4cfe93371847b3157966b02151703908058916f456186599f176d5f87ace9d69d95993b5cb8da';

// https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.12.0/es/languages/${language}.min.js
// prettier-ignore
export const HljsLanguages: [string, string, string][] = [
	["1c",             "1C",                      "3120a75ea3738089d1f9d7c6ebddb12fc72715f1b1c4e254e2de02ccaef6bd0aeda2540195e71c47758124ba504d53830b19a655fd50cbb759ab02e51dde12c8"],
	["abnf",           "ABNF",                    "3b3b8782a563f4daec7ca9bdf05dc64f92a78cfec7175fbbd63c9f19a9908b394e258d101c55700e802752c98967e3fbc14ce0dc8934e02a483bc1ddd3d073da"],
	["accesslog",      "Access Logs",             "e53b0bb86e7bcb32aa5ba065f8b70ecf7b21bb1276a48bdc662c7682418b703f21a289bf7de80cc2b9267f2cc8fe67104687c78438ebfcb69e5ebd7c57733f31"],
	["actionscript",   "ActionScript",            "bea3f2f379e80959e80c54a8cf05f2e985c28e54a5a86cfeb05f3cf454fd0fa2cb10b5783e7e80a34a16222783c12bbdc41172c879f11f31c7cbfe061d992047"],
	["ada",            "Ada",                     "1c1e0aa3b96e9c56b633665d560bbe4e1b1309431e479e943546be69f0f2388b38f4cea36c91297b41096983dbe71da4f2e6552c6e70850c6205bcee7ef993ed"],
	["angelscript",    "AngelScript",             "dea5a881e7434ace9a04ff392eae91856dc6dbe503273fff5c99490c864478ae9e2e1e28b8ed27bfc301db598a43cd12381ba9214f9677e6cfeb5ca25bfa6a1c"],
	["apache",         "Apache",                  "6e5a3ef17759e52e33db61970b0a7cfa792fb2211bfcdb25d34c6fe8cf8db2b9f1e48f110e4d1f84dfa6ea14c8b8ecb680233ee0fa8f2787e67b94cf9fbade22"],
	["applescript",    "AppleScript",             "2ef8f851f825186d5315616c965adac4996433a66e1d7e94fdf3d266f099f3ba41cf5501c92d81a653dd6926266908af168f96e89d33acb37e05055f89f266f8"],
	["arcade",         "Arcade",                  "a94169035bfddc2491b836a3b97e5206741731adbed12ad2185bc599a9648ee94487d13ba465f5dc2d08b30d1bc815fa433a1a4f8dfa70c7298c8d45b0192595"],
	["arduino",        "Arduino",                 "c583f528fb14dbc0fed0a31b3faedcff179c1394808fc17412bce3777485ccaae3007a2e57dcaa512fc91cff665bb33b30c03cb537c8b2fb5f88dd9506dbeba4"],
	["armasm",         "ARM Assembler",           "725886a35408ca59d92842d207246e015da78cfda9951fe59881a4d50555332881f3cfb60bd4a8a10fc0ace687e17b5eca93cf0b3315515b3fc979d4f33a2f94"],
	["asciidoc",       "AsciiDoc",                "f05ccb21d689ca21bd3706fb888a266155425c00c285d1f9d43f52eb0b6a4f46c034aa8460d11a1341d3930f74e07d99d10bf354a2bfd9ec1366012499f8f82e"],
	["aspectj",        "AspectJ",                 "72b8a19522580c5955382563f63cbab7b4ae0bc1d5ebfe4d4578601a9dafd639e05418ccce0c4e2aa6103890393abca7387d20fbf7dc65c06bd96f9625701455"],
	["autohotkey",     "AutoHotkey",              "896a029c5845764b8028661d900b57e7dc93361c78976f2b29da069177b4c36f0f3eee063e29315af618c7568f28a28aeb6e35e10b27b4d73e4c3d3533dd507d"],
	["autoit",         "AutoIt",                  "757d1fbf23901d8b59a734cb302519978b5dfc300b25cdb5a31656f0b1a3ec12635b28e5cf0030325f55ab05f2ef21062d4e36d6a67d7623107730d4a25e12b5"],
	["avrasm",         "AVR Assembler",           "002c78e05bd1d86fda8f888583a3bc41b1ef8f83b4e1cad9b787b619d8591b0abda5509e38a3f7024ceba671601675da1fa003d8d042c69e90ddc38ebd505b6c"],
	["awk",            "Awk",                     "d059880af0f4465fc6be52c35f72f5b5270971e611a123de7d7ca064e8d5af1f94a1dfcdad72aa52bb8c53e5115ae1fc749430aeca9f0593f6393425d85a97ac"],
	["bash",           "Bash",                    "4f435dec0fe31e3c967cf3d3783c98252009f2451d9242cd23cd3db5eab26b10be51f72149d44f852d318c749c102b98225f90feff2952ddfc7fe6ea02df9bfd"],
	["basic",          "Basic",                   "49b6ce0a13b11100cc3ff4bc1ae0fbf3b4224f1a6e15d84e96e121fbeb62a868fb7342855d0e88b8980bf06ef93d307baf12ca5bfc2193b4ffa6235bbe673030"],
	["bnf",            "BNF",                     "fc210d0cfaf4d247fe3ed9cd9b5321d7fc679761e6d70df600ea8eeee6d22bb5821978f653eb81f13b3855878e7c1f2a686202b3d52704753590074a2dae1643"],
	["brainfuck",      "Brainfuck",               "30f650d196b5d7b98907ce00b9258f701458447749d72c66a4dd17a61f3798b326fde92b28ae193087bb8af996e7e3a4a8bc0e390b3f8d71d6efa031fe9a6b96"],
	["c",              "C",                       "cf2b28a74c2e652c288c2387919c70a7a3f8da0203d255e565249cfde27360c45a5f0caa158f3ad06057fb55f3f532a0a8b12a8df9786f1b88272f465fd8df93"],
	["cal",            "C/AL",                    "ff3e49a23bf4be36103e8099b165bf080133c470c83af4d6e5db0dce5458a45912ef3d09b4470813a3b2b82fd74a244e84fc701e72dbaf6122edeb125bbcddef"],
	["capnproto",      "Cap'n Proto",             "c59366678d33cec396f5e217e8f376e997aa2d53bb1292e69bddf9f6357a67702c02196db47865819b0d6295712bdc773a2eddabcf683cb6e3315f0cbb9d64ff"],
	["ceylon",         "Ceylon",                  "1d3b8bf4de0220344c009c959ca279b15a5c26a6c8f967d0648eb535a2d970ddc06262f68a42d593de3bc5eacc88d0aff668083fd46d2c87546139e4db7d1ded"],
	["clean",          "Clean",                   "f0e54b3ff0c0e148a508b77f8d6a29d115151c4d7b0741442b06d0b3887b7860ae9c34d4e5e02d7e88cf8eccd5544e683ce080bfe5aebb9ac74359eb2eeaedc0"],
	["clojure-repl",   "Clojure REPL",            "960bdfba6695d0c9dcf7cd85430364435332c15f81a5ae83750d112d05aa6bc1b81def6576902fd11c20b3227410cbe3ed88ad7a10f86a0cc5766c0af3e20043"],
	["clojure",        "Clojure",                 "e51599e8859539510c7a7b6b2ee6acc9725576c461355f3eb5e309c0b4b3603a19724b61a6ff05b66c95c76ac62a0c5ba7cce20bc5b6c24d7e49764f5dc856e2"],
	["cmake",          "CMake",                   "a4602980170dd57ffd434c20d4517a0107204c57fe3881b4b6ba7952039616a9ef96fb8d260cfbe73661f680d72fe5978db8c803245122e2727dc8271512c67f"],
	["coffeescript",   "CoffeeScript",            "4a76afbaffa5d82aa18d44d65f426b38344d0c100f72e206b1e7c3238627343cc7546085c91d00c855a2e899c4c87a5334fb0b87a7ed46392a3b0a3ab3b531a3"],
	["coq",            "Coq",                     "b64b695d60494b95d77c26a4b6a21831fc6249bb37c4688f6ba614985f6e50be9b17218b13e6b314b3b4e5b532a244d674d923b95b88659388c83dfe1dc985fa"],
	["cos",            "Cache Object Script",     "c5187e42c4f9887544693e1d5610c800d9fc83b479c793a664eefb0b3e8aca4c23d626083ddced2ff456c773f22a5a543c790d2eaee39889d7a5afdc5a287c99"],
	["cpp",            "C++",                     "cae77677defae06af16426615b815ce67702ef951be5dbddb9d2c1b755c52283675fc32924726a174a2404fa3933f54e2d69167fda4a277c1395e3bd1d3df6bf"],
	["crmsh",          "Crmsh",                   "20d461376e83798a3333ecdf6a17dd7704490e926d9753fda894a4aecd4140dc5f8a27c646fda269260869779295c8ecf1fef68b74a7b8523b310cec41f1a895"],
	["crystal",        "Crystal",                 "bc5ffa7d63ce596ea6c4eb8f72a2b99e66f3cecabfefc7a2454e8c52a443ca14ecc8bc6473b485418869616fed2bc60ae727be98493ba0c5b93584540b7e119d"],
	["csharp",         "C#",                      "4fd955159de889416952dc0465003c820ed45334657a2a72b52ac4f2e10b9eac16b8861ae5da298d957bbbe93140486308e9ace206d0e032835c15abee3f3c16"],
	["csp",            "CSP",                     "5de67b4e29c2be19a44ffa1ee13a9cda14d159014640741aa9d2ec4f67b39fd6195b2ff75041ee5541d0cf31d4e6329400211d3666ba559e3720e08eb5df00b0"],
	["css",            "CSS",                     "ce1e1e96c8c87e325b148669745ea0609538ccbce4127dc271951b6746600ec5fe954410714c8c7d79d398a0b383933e8ae158f602630ff69fe9167403475eaa"],
	["d",              "D",                       "4bc5bf9b09be01a0df8e57ab60a4de928a22317a7ee8a72ab97eb5eaa9da1326298297e1818514740f4bcb3bf1ca120176d2221b213acaa1acad60f185933d82"],
	["dart",           "Dart",                    "fa3a8e46c0d6c3af642e6e4459b00cc700cad9a675fbd514b87419c7e19e176b4821837436179cc413c06c532db3c74be88b3c962fd500f16d2bebd1a6c295de"],
	["delphi",         "Delphi",                  "c59b351c836a9b1db62b5ee579ba3fd885e0a480188db9b13a146f1fda16e491f5c65a3a8f34891628eb320d1f90504382b18e558a63d17986b91500ec718003"],
	["diff",           "Diff",                    "a8bcd9b88c0e772c24295af77659122ea311be80d3ecdd4e93efd84c5e98075c5313a039a267988d07b07118c16d5857025dc89fd824c03d6629e1ac5222126a"],
	["django",         "Django",                  "5a67464571f34ab2f9bcacbca8d8ae029bbd1f8b96d93f777c66941017cf76fb8a55af6dd23b66fbb61f72974be3d4772c1276b1c9d7d64c2f7c815799254517"],
	["dns",            "DNS Zone File",           "e0c9517c6ae3b6d871e55e6db983c81fd7dfed04bfac39fe21ed4896ed03c6966048553f2b30a59dfbdc6cd73033b7c5a3b7f2fc559ffda94e4b59ee6a0b735f"],
	["dockerfile",     "Dockerfile",              "1c0481fa4bd5d49628b313afcd28b543fde65f2b40ace612591065e0b7c505dcd9f288473803181e68c44af29679011a7a08ea67429afa4fcd3ec234a076de0f"],
	["dos",            "DOS",                     "1bfdcc2854d3d571cc8236692525014f6727b56df853af137776f5cdbf52e586b918f2800ebc4b6c3371146d43bc042dbc9f76b1a6784bf059d0299fd9fd2435"],
	["dsconfig",       "dsconfig",                "4bdace660eee807421a5b591ba7ccbc8ec0eec452b45791b102fdc6d0de14ceeaa809d76d729aa2a96d984b61ab038d2311014646f27d79155c0bb20e1ee89fe"],
	["dts",            "DTS (Device Tree)",       "a07f44adc46a9d4f1a96a1f8f12ddbd851b5683c7b3a62354bb9c96b2aa3f7c6d677f1ea12495b0aa5ced99a3d66707f20cf40305b86cbf3de73ef732a63be0d"],
	["dust",           "Dust",                    "1284158ce3873bd6389b5269282a3dc66c523f47632f515819b96896d226029e92f3fd2684b5174162a3dc700a3701706de222773312395a41ca9dd296965700"],
	["ebnf",           "EBNF",                    "ee1f987d953d176e77646248cc5463f8b53824fe4b5fd2b1e2ffc15692512387bc0b81126ee0f186d2700ae1cabb0e62e3efa557b506c5285b082a86161452a5"],
	["elixir",         "Elixir",                  "728099ae62e752f917c6bbb2e16d48bf8cb1faf37fd5266864a6c7ca2baf8b827c093e89b7d72594d625dafef7c59da47fbdb7fabdcd83584eacae509ac8575c"],
	["elm",            "Elm",                     "8e77dcaeb515fb66943a35248c02d7c44231b96b68e5310307fd4666105938a8693f961ad7f8f015d242e2215df550f010fb897aa882e16175885fee51a4a30e"],
	["erb",            "Erb",                     "6f93dfee8d168848252559d5503ee3beeefa8209720b1ec847fb8990e55fdf88ff291e58ee0c81643fea82f8bd97b5cd2b2ca7ebda45b031e456d8de8164c46a"],
	["erlang-repl",    "Erlang REPL",             "06a5078f7165d2447245d647c0ae939f4804f6af2b19da0ce7cc457deb76a3ac275bc9d858eaa92819b139a056527260c8c2fd8d6efb4bf32367ae0a9135720c"],
	["erlang",         "Erlang",                  "06601086a584335d93faa41c49b07dbfa7889d4d03b88d0d8f6162e84428f4832af2ecfbc3c6f1224215d681981e28c421e9ea6b2be50eed06153caff424dc9e"],
	["excel",          "Excel",                   "fd48acf3f5c9dfcc5f8368f6470f37c96940dc1e699da0a4dbf809566eadf41b510cb48d54cde5bb7dc362e5b9da39fb8def1f36a09862a7e9d8d5bfb2838dd3"],
	["fix",            "FIX",                     "0351274ce40483248ee49c42818a7536a653ad3976773f880356601ae203338873f257458481153252e72543eaddc69dd72cf5df2cfdd14c78b002a4a841bd7d"],
	["flix",           "Flix",                    "5e299fd76b1dc9fef2a7afb622ec1412e6755d6a3d6b1e9bc8eb2702abd384bb7cea0c6ed3fd768969e44956aef65cbbe33aeb56b97c8f63ee4493ee02121ef4"],
	["fortran",        "Fortran",                 "4753b94251bacb4b533333e0d40ca0fff226f1bbdabb9724e69412a110dc8b7e516a1ed08b2da03093ae9b46b774fa53fad700fc70ab943127171a0f7f86cdce"],
	["fsharp",         "F#",                      "67318d56b3764ac645c7924e1bb8528e2b470c4dc86c9bc323725edd7f2368855d42c76c0873502d3b118ec1331c38eded4243c5f90f53dbe6821e19cf6769f8"],
	["gams",           "Gams",                    "8e591a9718dad9aa279c452d397449300df4c89ef2cf8807a4c15dafc7f9d4bf17232ea75c2cab4d48a8f26c99b9e489b20568760e7c340f467c28491af17299"],
	["gauss",          "GAUSS",                   "b4b429293270c3c470ca39e883ee32d80ac0e2764188c060a327d247424eff17d0086413ec2f09c70b14350a4a7b4f2403d07854248ebcd4b2b6554bfa0efc14"],
	["gcode",          "G-Code",                  "9c6a46f652f67c810e5d2d313510e6db665b05cc69849bf040d9d5717ec7efaf404cd1cc09cc84eff704798b7f8c2cdd9c2a0a1cffd8364cf93b3d260abac13d"],
	["gherkin",        "Gherkin",                 "242c0ce1bc8b05bd7bc782ed583183180e74c62b948508d5d86c66898f76fbb0323df818332fae5ee5b6e4f80f4c2ce7ca22cf5034f6493ee4a83ba477475f62"],
	["gml",            "Gml",                     "d6e8288fcb1979522f1589c5ecd3cf64fd6a4fd968b65afdb4cb11d2da68faa0455b7109339e3354d85720bf70ff2d1ecd7c4a786b6e58580551e68f0b573bec"],
	["go",             "Go",                      "d9fa4b282a90bf0adeec6e84ef3d58d8c417d68d7b0331a522e20417bc0dd270962772685fa968b4ce852d15343b45416cfbc71131f3ab6bee7db8d7f6a37d70"],
	["golo",           "Golo",                    "0de9b33fd8cb51283e975764f54ad6bd1530cbc2b16b15211662d3bc7abe2c88aea21fa25c734507e546f8c657a533593759d88c6e26e3a72c8985750c26b874"],
	["gradle",         "Gradle",                  "697e1f6cae27b9cdef8d96854d35e43648d19650a048da75cef6a2e6ac9150e0dd567ee75804f93800b2de21e1706f22382b4321a1eebf5df0d70b60f1adc3da"],
	["graphql",        "GraphQL",                 "dc3b12699d64ab3353e33b5cb6683b75ad59b3ab89019c0e2e61f7e8ae84949fedcb6ed83ccf2078d443dc2276ece7b7115913b963ca2f241056754e7254fafd"],
	["groovy",         "Groovy",                  "675d65dc9eaf52f732d77814b98278f43f463946ba032438f1dae24f05829f7af417755b4db447456474a5ebab043aadd06cf8e7c9d4a06d34aea912a854c59d"],
	["haml",           "Haml",                    "caf09a1838f7daf4d926a0b29013fcb18aa748656052975cb364e19937b2f883d8174220333fbaa81246623b64a756ca2eb9243620a57c0b669eeb494ffdaa1d"],
	["handlebars",     "Handlebars",              "78a656166fb11a28117dce61de445c20ae6deea42f77c098ec2faad1dd65f144c13ee07f16111fcd04449666f6acdb8180eb3cdcb6816d38bbe56a41885f8023"],
	["haskell",        "Haskell",                 "50536b9e2c0d15f86c8235d4ea2f7b8afd9ad1bee4656f18e8406a01d3f2ed0070de3e5d7161f77e569c9c6cbf74807771c70334aba64cc15fc57f12d24055ba"],
	["haxe",           "Haxe",                    "bc9e0ef35b4b4b33ebeae4643db437a93c95df0934b2fe0da64953f08c1d65d582c51f3cfcf28da3eb619cb2926bc7d86192c39c57fa91409b4fa6dd57de5228"],
	["hsp",            "Hsp",                     "c46b8e02290e589f0124055a2bb26d0e1b1596202f102df2ea575488e31112d2947f7c15b4717eab8dcfd6357e6b21c71da95d67d4a908a9127911b7252ce67e"],
	["xml",            "HTML, XML",               "b355ac13780f8db431270e01b398ee74f54c2df48156d399c7dbac98a9b9fef9c78a5c4a3ba171b82b7b569645adcfa5fedf2739cb8bc4695d7c7a24cc366acd"],
	["http",           "HTTP",                    "fc22a1ed4eef125204ab4765d4b3c232c4ad6059804678284f42909852db7f1e14f2da92084df488c4fce9ef35e4c9458abf12494bf4d1ecb467ae8cdadb6626"],
	["hy",             "Hy",                      "b46d7bdf72f212733a77f2c69ed2217af26325dfe581ee09ed671d032d32f346d9503be809f55321c89b7f7e6536dbaaf2ae6f9d86bcc09a8169bd880e10c33d"],
	["inform7",        "Inform7",                 "97d57bb2a849aa4627396d0b18b19d893cadc37f942bba937037843c7e8f82b7e13d4a523bc7c98b7c9b7e66841b1d76b90f225f0ffe914470ee91ff2e3c1338"],
	["ini",            "Ini, TOML",               "14c70f259b4c166d07f69c6c0ecb43854755bf481ad29f3b48fea14be0676bf5437097d675c113dcdc85e611b70cf93a7ece1d1161899a8b73abf16883a71d8c"],
	["irpf90",         "IRPF90",                  "ddde9907553c516cb50a7d78e222ea3fa435fdd6b1741bc9ccf71b92ec64082a0ca83fa507a86457ccf1ab3a91aa2fda3b0aacfd360be3cb4ae6d19035a1c3ca"],
	["isbl",           "Isbl",                    "86bb86134a74a8136e187aeb980cfbca98300d8f55cbd05a609186d1f8b6d698fdd6332d8b3abfbe61f0665c159e509a69c0bd42cdcea7e81ff8e03dc7a4f9fa"],
	["java",           "Java",                    "9677ffc5211fcf95fc2504a413647e7eae88ccb0f69424cdca6361bc8234f1ccda052462e405639e71688ba7a0751bc202980e8b32b767e7919457f4fbc8d0c8"],
	["javascript",     "JavaScript",              "0fd986ed789e0b5ea091be51b0b53a04c61bab86c99819a20faf536979f2839068a0d647b2fb3d223ed9383dc61499f87390bc77e21c8eb9b89ebda3598440ab"],
	["jboss-cli",      "JBoss CLI",               "f7c1c557d89d2b441ed8d06a19ab06a92a5cab3c48ca1995392784bc9a28cf0aef076d8bffe957b03a5ab26dd700c93c83254778617ac1bd5d36ac5607b6e58f"],
	["json",           "JSON",                    "5b33e369fc08d8a1be26226d43058bdc17c16a2d346ee62cc9f0da9e3933b4ff2eaadcfbf10b1b656840ec9302bc940b6557a056760b38adcc0153d2f9fbab1d"],
	["julia-repl",     "Julia REPL",              "e09919c7229cf3f25896acafb8edcbecefbb0c215d0828e1803f173ef6ac6474f5a442a3544875628d3c788f16ad5acca580006c2ccce6bac578106ddb173d92"],
	["julia",          "Julia",                   "788f2c5a2d597b5f1beae275749e4d4b8905fdf3c114bf82c009f755c4916768a71cc0ff19d5bd8f8e0ee4fd99ef7ae4cb754d73b425d44702ff0a9918f9ac92"],
	["kotlin",         "Kotlin",                  "70992ad3739960328a34c2c9952be87f70087e632a0bd32e13668a383181f6331e906fb1969fa100bded13ff7a0c37d77bb22641cf0d696a29ba99424525394a"],
	["lasso",          "Lasso",                   "b2d23f4348699eabc2807a50d8157a4ac84f25e934d030fd901b9a424749fab5fe1597481dcd27b8ddda5908c605c09973fab45ef0f137b806f8b4acc4cc7f24"],
	["latex",          "LaTeX",                   "5bd8a5e83b1c9e6887a0b061ccdd9c4033155d2876ffbf3d9d406bdf420e4617b8f205f4daccd28528220e0bcb39dce3bcd8574cf51b5f3e12d6c36b4dd1eaea"],
	["ldif",           "LDIF",                    "7e658b0e9e0e6194483e80bed159839f41d20747cea2d694bf2b0d5a674072da138ff2dac18db64290cc56fb9dd1ba1ecd932123ccf36e198ad3370559bbc743"],
	["leaf",           "Leaf",                    "a613c30e298ed03f83b796701b0020b8ce03e2e3fc536f46dd4293715ce65c7e90b16239314a88fa087ba22b12171c1b8dca4be49184641df648ec5c07e53199"],
	["less",           "Less",                    "dc6df4f2c642fce39acf5f65aafef8b60b78598f56e62ac5d9a6ce66dfe3d188aa68dc2956f923d0092a405a314ab0f286d31a97f9f12ba28cf2d258e49feee7"],
	["lisp",           "Lisp",                    "c517037ddeaa916471ed9be9c31ec908aa779b1a20082440ebfedbb16bc57ab945f713f67662f288fc022132838032cc4833165c866eeefd3a9a8016fd5f1689"],
	["livecodeserver", "LiveCode Server",         "fb456a271792e509cfb86437d336ac6224e63faf02795df47a105b6a304bf6c0ef582a5173568cede98996951834c5e114ec2266759d44e4e8c4ac27de658fc8"],
	["livescript",     "LiveScript",              "7b0e386a2b8a5aae5acf182c461b4f1314feb24dbb38ec9e5b28f16adbfc54716baa1cc190dc0155ff657925022d035dd8df6ee639aae26af4e14786541e888a"],
	["llvm",           "LLVM",                    "493dd5539087a8258a8c9ecb9c789e69b53ce5771365a6bd0838b1eae9e5a67bd6095cbc8445f187540f4ff9cc26fcd808ddac3cff7327e5b3771d181c775977"],
	["lsl",            "Lsl",                     "cec4fc0e5301330a271485771ab4d0e92979a79fe3700bed292a6b1e3808e382e2eea9344ed735ca5a0c910e8e1a4b9f292a294bb33196e72cdc2447228c287a"],
	["lua",            "Lua",                     "ac146e9d6118c6e716b12a2d162d46a6341cc71f5dec528874c7b35799f1bb376a5ca58e442a223ac3918accb6138d5619dbf83ce3ae05269e202901dbb15102"],
	["makefile",       "Makefile",                "8dae34a019dbfdd041cfe505280efdbc49181e6ff73814647e212ce39c82c41dc87c203d0ed0b0646be76b90fd69d294e9dce474d9734472379084f342a0dabb"],
	["markdown",       "Markdown",                "df9d387e288f9ee59798c3a27c91e01865eda5bb63381f7552f1c8526a5aa036fe06979aa8bbeb73f0364d6f2dbf04024a23aaf87403b61f4dcb2bccda5efa6f"],
	["mathematica",    "Mathematica",             "3854453c35219f62a07a6e42764ceb2dbb41e3c7fc96b27de4abb4b7c81e0059ebd66f9413fa62b4ba5c682c816aad99aebf2a08f1d6462b5147ef402236ac8c"],
	["matlab",         "Matlab",                  "1495856075734410e70d5d6f8a3e1dd7eb7b50278609f9ab5cf9905a4216c613d3b7ce93f1d16686d5babbeba16dd5b3dbde826fdba0fc13eb9f60e8bc267a29"],
	["maxima",         "Maxima",                  "df475452b1a2ecfb598eacb6b0da2be69da38a938476bd39407cfb0e44ef4cad35a9a165fd599579d0577d1ef132c34cb08ba56768118e59957d20001964e1eb"],
	["mel",            "Maya Embedded Language",  "fbb5309bb54593cc3be000aa8d5f086cac8bf7a7b35f355ecc93dbfca7716f30e7595063f8da68371ac13e879c0142da674366081c37638e41af400a74027fd1"],
	["mercury",        "Mercury",                 "ee9c64674fa2592e9e989657da1e9b5cabd157665f8b8d90d2d998318d5f324f3f3d7e5c5e8bf4a40bcbd877c699c8199d9edcf5220696e0b568882d7facb128"],
	["mipsasm",        "MIPS Assembler",          "53a3e1b6907c6b03f0acd79c1fd3ef719081a1ed5ed0db36f58ee25bcc3896377b3dd351065ac294a19ed9b42bb922e2cb27c5644a04650a247d07223d25ae4a"],
	["mizar",          "Mizar",                   "03d298d50fec1f52e0109d9339e97c1510f25bc0a55828218776efd8e855335036a1b4a7b9e72fa8f1581ea458ac288bd50e8480c7cc8b4ef4683ff2a976afc4"],
	["mojolicious",    "Mojolicious",             "22e7e5ff67e1036d90b71a72c959312c1bca2dac52296dd6134e487e75746924763e5bf4cd2e31f332cc722e1fd37576420b23cb69178cef8f005f8ce9bf5efd"],
	["monkey",         "Monkey",                  "c61a6928592d71fa8d76cf394be12f37179b3de45ff8f9a7dbdd451a91d6403aa0a8614bea7dab505e9eb396bbeeebae742b5b4a077300a27292f95d0131d9a3"],
	["moonscript",     "Moonscript",              "1909c83e7a39a83ed88697c863a133d6da7fcedabdd6c9213d4ee9d3755e596ea9b626ef8f8b4505b9ab72a7d59341fce5ff90f0ff528e2a53223efdce1dcbc2"],
	["n1ql",           "N1QL",                    "906c5f3483439bbca48ea11996320284d00f26155685f94cf59e8e61893faa432c5ea1f049bb70500f533c1da809e8233d28e5e21a2d890ef6dea6ed6899e890"],
	["nestedtext",     "Nestedtext",              "49051d0f8344b3eac9558f685f83abfe50001d1468a2f1228eb72471918459b5d905877affc14304d871b037f1e35879760ef7c11d168578908351a610c74920"],
	["nginx",          "Nginx",                   "bdec9c60fd430d32b8b1d94f30721397df2d716f01e89bf59ef7488f300b0dc1c69bb9dbe9e10c270d4e4b0e16a0babe42100ecfbe194f8a9260e957abf17367"],
	["nim",            "Nim",                     "b305e8ff5fc648c88a41119e54afe3299c4d23deb41a1b127a7620e42219f85df456c082c5784d853e5610524b04f49cfd1bec22ff328c2cca63a6bbf9e21052"],
	["nix",            "Nix",                     "791cb9f1b75ea3839167a44ec1411aaad5acaa6c66e78091b1a1ec37e05eb41326b5c085b46420b5906ca22e4f9f9e892e70b5728a07e3236c6f3c2337e50b5f"],
	["node-repl",      "Node REPL",               "44d9ee4d276a4581b25f832dfbb4b225e2b07f7dc85bbfb04109074346be006e2bac84201962705ee23e4979949b618022702aa0fcc7daaab02e33250fb22a6a"],
	["nsis",           "NSIS",                    "a21f1b287dea72c2815506522debf6aae37c11044fedd38f84817c99a57d983f23299a579fae8e95ef3d447e5c3c704a1b5e925c80995b6dfba560d601b8e337"],
	["objectivec",     "Objective C",             "d5150fb836dd37d532afd02e7165e08815f7482bb28a491d01c8c77d0c7239786671a497d1e291e35dff5393ea7b431211caae6b007ce0ac9d764bfd23a6d987"],
	["glsl",           "OpenGL Shading Language", "60ee92a9d865bdc1231768952d7da85aac01d39cee450c521e257deb8e3a9d6c7fc32577caa1126d404036f796f6b3c15fc839275a8752559ea359de535569ae"],
	["ocaml",          "OCaml",                   "0b446db790777934d8fb9cffff0bce8c7d37579ed69ec87bf787bba179844969f3b75ce7bb3735007198d3c088bf2d9e4c8aee584d7ee1a38de78c63fef0abdb"],
	["openscad",       "OpenSCAD",                "46052f29e32817a7402c8e4acc47187ea8975fbbaee73bc4ebe0750e359f5bbde237ad90fd58e4824d210671dfbbb208d51a1be232a52ba43034e846291f6cdd"],
	["ruleslanguage",  "Oracle Rules Language",   "633a5f3dbe9039e2220d5b3c3916875eac7bc46ac1c7627dd547959e6aa2a3812cf89e71f59176940040a4779f69887787aef64240e33cffde36e28c2db31e5f"],
	["oxygene",        "Oxygene",                 "51f1a6b06315dc024f27eb527183cb60f3cc32ded915af34977512d818ad835088d0f4856e03dcecdd1bd0ecbecc1f5a21d57a0e24ff5bb962f83409d7e3685c"],
	["parser3",        "Parser3",                 "62b4e5f18ced820344e190f617ba9b692774317b8e8c1760aabcc1ffb6c6f62dd7c357a1523bb443d244f7a41cd6d808b4052c5cbbcaf73827310935d2e7798a"],
	["perl",           "Perl",                    "104e7b9d14cbc07eb488ca6d0cfe6def374814e280dc3de2b480e1af661f61f4f92598bcfc6176b97152202e95714e1409b5a5a5e79f30e8c64f5893b6bb1629"],
	["pf",             "PF",                      "30f98dc6f6828c861c795531abe3f4cce01b1034a2635b96bb75de953afbf9a76dcbacd2fdd6d3a103a2c31d17a90db39b6ea43c983057e95e980d834801cdec"],
	["pgsql",          "PostgreSQL",              "7c98d39cbff5f56eab7302ffb505592efa51b45ddc342544fb5063bf3b7c537e3f52aa0b11379f0bcfe8ab3d3fa99c0649fa6ae98e85f6aaef2f8e80a6960e13"],
	["php-template",   "PHP Template",            "2e3831f30aa8aa560ef7931983a29c294e0af741bf597b5f10de541dd895b0f07455cf6dfc64956df4ae0098b3086cbe2395f3ac54524cd207a03fc897685b54"],
	["php",            "PHP",                     "3bffb4795de51c8cd713fd8df79390e055e2180ce085a75bb3430e02fc7bf383d570bcea134eb6ada017060690521dbdc8e3284e522b9f4266013ed1f8df79ea"],
	["plaintext",      "Plaintext",               "1b8ce7ce39740b631cc90fd1513fe04634c7a7bf2dfad59fc870ebae2245c3059ec211fd22b0799490b1ef4ccebd14105eb1e54358189dce557bc83b07a2bdda"],
	["pony",           "Pony",                    "d3c61b9d3befdb86f9c3be777b7d54382f36f46a49fc2dcc49a1dde5a71e49b37f6c63a1255d3ed98c67312133cee97b19399461eeeff0f62a4ed6b527cefbdc"],
	["powershell",     "PowerShell",              "19000421ad19cd8fcc16fc887bda2184dbc316bfcfeaeefa57469331e81f31f91c21648ec7f97d71d8edd7e9941a9f760f587021b338a8bf75fa64d144ba0fbc"],
	["processing",     "Processing",              "50c3a36d7ddcd2e11cae94eb1b26bb2f6f09ebda3bc24d8cf76cbed6d87429e982ab1d4029656a24f60380d5d69ef8870082fcac7ac01dec6ea2a6351d228360"],
	["profile",        "Python Profiler Results", "22e3bf224c6a6733b14de020bc07b96c5bef68767e59e01ba7f78399e59c5a91b5c1a3b3ff057dcd6470ef79f34eb3c9765d3ed544df66e8cd2bf635488a5be2"],
	["prolog",         "Prolog",                  "545008fe5910cb8125593f6eba273940b99ba3390383be801abace4aae6b32f56f20e81e9945c6a6cc6dc8129f34f43f5eb0c0fc0c241020cf3c6be186463511"],
	["properties",     "Properties",              "a35576118a355dfc648d70ea2a54291d7f90cd65a4f6ff0ab0d9882e52c2edd4a1b8302db9e733bfd5a653c3cc3c6f546414fa3b8b95d5b8637e55841e28ec89"],
	["protobuf",       "Protocol Buffers",        "00e22d674cb5259345620a897b148e6392a143c2c411dcd2759573682bb197e8e97292fc41876ae39079ca4f27022065701fab26affeec9b4aafc0480ef900b7"],
	["puppet",         "Puppet",                  "a94284cdb77d8099d4d0fc5d642a8beb31d74e5ca1d3359041d028ce5322acbbbb62de028a9d78c262f182040563e44809cb6340262db438515012922d799cd4"],
	["purebasic",      "Purebasic",               "14783b2aaae99b711e74a7aa66d6fac98c1dd8492eb6d9f7ec29d8f255344cd187f44e9e793883faf532f8318c10c8ed2c920014ead8ba60dcea4a2ea1ea6278"],
	["python-repl",    "Python REPL",             "01f35050ea1d87aa1186f18592b5bc19d73bc6c14969139d1cfad9fa6815e5627e57e5f356c091b7466883d88130652d486fd5dc555df7c70cb822874b942c6e"],
	["python",         "Python",                  "b7cc7e3f2622aa534a3a8df5d9163b4050a8d700a0f7e63010f4e1b80b35c9177ebabb44e51554be36658600b5105e3292bdf53218d3edb831dbb0782b3b898d"],
	["q",              "Q",                       "c4d88ba2b9553298c3a4ffdd5f71a0110ce7aa42c1899db28f36817ddaea5e219543418e1b7add049103e3fbad66dcbf3f78eace3b95146d7911bd2cb478f934"],
	["qml",            "QML",                     "3deb6d00a621a5d037a77c55b34f8dddce2822ca701c77680bf088b3d672965c66c696ce3947c681e0513c58211630c51e96cf5de1807bf9141f42bdd5cdf109"],
	["r",              "R",                       "7319e65d2e021836ab9bf4cb5cf2683d622277583e84680d967681b2dfac6b289d38867d704514b67ac02910a326d1294533300e226bc169dcc47de565f30da4"],
	["reasonml",       "ReasonML",                "7332bcfcf12d7f0eb85a95ce3945b403372c7940cd805e53d60d0bcdba133cc17347e52f57306b8c64c68ce74e48efe3a86e2c90fac3e7d6120baeb28838fd2a"],
	["rib",            "Renderman RIB",           "9f917dc4f82eee16f02a7f6c4cdb080a2d21d9263766b22aba5df37822687d2c301b737f45b61b94d256bde09463bd0e4ad6c499dd4d4dab9028e102cd2c2160"],
	["roboconf",       "Roboconf",                "3b34417385ddf4a924ceedc6f447fdba5cb992d422af9481b77b09dcf25ca536571626da68b13de84f6c0deaf4143b0d5ee52eb3796ae70ee66bb14204990db9"],
	["routeros",       "Routeros",                "eae63d85fd8e9efd8c549c8b918f16a2d168b300ac0951c34312c036b8061fb0d8b97e63545491a06c1e1155a2cefe2a1cd3a49622019887137fb22d7581e3f4"],
	["rsl",            "Renderman RSL",           "6f920a68655253ec71700fd4a6ac98cf3c1c713601faa47e59c25878c4f8f483d73e48c4ceb2f91b2548862b8a4688317f629f87250de6532533aa27e357f4de"],
	["ruby",           "Ruby",                    "b97508bd94c12f19021d32fb6f62c8d8c7a60bf66ab079b0dcbadbd41bc9a57b105b6b5b25e767318ee2da8f103f112f45a9c8b7ad1449c25af8cceecc5c4590"],
	["rust",           "Rust",                    "ad5b4a32c37e6dd4bb6253354b888d12aaf938b80ab9e34f3ed2fb351f0531cc041d912d1f9f11032b180a13fddbb7edab0b253badaeaf5f2d27db24c8a7f3c4"],
	["sas",            "SAS",                     "e134dd8487a81ee27484d732a66ee2a36505278bbd1c0c25ec6375c602cb934247cc30d6a7f5e8a8b136744a2f5e64900c196f89de3314fa1abe11df08cd5e15"],
	["scala",          "Scala",                   "266bfad24447b71ac40ef6f1df3c8479a5fe79162ae9dbe6477f87a15bf1cccd9c3e8f82e9c6a63f9cc7150f4a571ec769aa1d3b2956d2b90ebf9ad7070a76e0"],
	["scheme",         "Scheme",                  "da800fb24f5b2dc8d23200ca26547967195dca3107decc94aaaae3f5675c204f1721febb84737d589144e3bd378d0a5803eb16ab644568759a405e87b8435a1f"],
	["scilab",         "Scilab",                  "7e80525f7b8bf1be5ea85e4ec8cf36bbe884e75824ff65872d5606ae8a8dfaeabb49a05f49ceda6022672e424a044ec598c7df2fae210aaa3b6c6f8ec46ea9ac"],
	["scss",           "SCSS",                    "0977e3209b21bcf081d3d0017a445018642031e611335494b18ebab565da936e2137e47a64697f26ca814af3395d941abedda5c0e1cd1570534f149c3bab7834"],
	["shell",          "Shell",                   "6fa3b9422f865ff585f6b4ac6f04d98887e79a85437ccf2130c6c6ed3945d07d2afbd5de5db3e6316f559961bf7c843098fa01c5fce684458dd80d44fbfa055a"],
	["smali",          "Smali",                   "b7dd4114040faf9392fe0866c69b24352faa11a70698f0320d90980798562b6e741dd0b3ac6b8cb34e3cfbdfec86edc40e51929acf6ee4670460993f24bc75e2"],
	["smalltalk",      "Smalltalk",               "19c3c8abd9aaa11064ccbeb2f3e2b6dced29431ff012cac1b54be7d2984fdd2891521082b9c836f860d8a2d433a0144e242e7875827743ec60d28b3682585852"],
	["sml",            "SML",                     "d2eb6c6359074740bc198e28469fbfb7cf6a3688f68b73db65bfee3d5d05988902875161b2d4bc2889311cd98fba6c1e7cecfc9ab15de15df863a31ac9497a6d"],
	["sqf",            "Sqf",                     "41768d575fa45f5acdd5c1f39c2779652686f6d24f5b804a80b9aa994f7d9a941475f92487dafb56f131b6fb0aa2347ccbd3b59f894fd267793aadceb6780ae0"],
	["sql",            "SQL",                     "da6c8d08812557bf66166dec6eddfc41b15a5f473fb9e0bce0c3bb123ddb3423bfce68b71b1f2a90b389813daab3874f9f107aeb6528f64879e66bc2e24f5da4"],
	["stan",           "Stan",                    "8f105a432fca820764a693c691ff41cf8b44389638386d190438e50e8845bfadbb7e953cb3a2a5e7531189af6850ea82bb09758f8044004a41713656028c0d5b"],
	["stata",          "Stata",                   "b3336fd792d7a68f77e19e418bd1a6c01e9b7377c9997878a14ac1baadc6407832177c247701a3e7d074e71c6c762cd211e89f1cad5d132c70d576aa3316dfef"],
	["step21",         "STEP Part 21",            "72538837ce50805f65b9a247bce1953569009c45135310103cc4ad0572bd0c2b7a1daa990706dec8c3976512ceec39bc1d0791409aa3169efbed00f4087d47de"],
	["stylus",         "Stylus",                  "b2f1184d3bdee98018025ee6e1f1d62ff6eb0c6aeacd1d68a3a7ab269b13c363fd8ab072c650e3a0a7e9ed6aa659084dc3ca0519b0cda2022d37c411d2d0c765"],
	["subunit",        "SubUnit",                 "cd6172f306c10f4ea465f114a6ac739acc230399dcd9ea786beb4b3311626e37b33be6e8cd9e0b8be2a21aa19ac0de1868e02e101c947953a9e5eae7a7a45c18"],
	["swift",          "Swift",                   "6ce4536fba60a9abab83b45279768739207553e5eac9a68c7107d6408bb8e28853a0657ee49098a9d91e6a7f5209c41141ac619db1d5f3f2d6c4a6b7840f52cb"],
	["taggerscript",   "Taggerscript",            "049d2e50c29eb5f5b19b45499cb924889ee4f99858affe562e359ba3cb100cb1624589b3aa3746546cbc1cbe4de861a3a3c6d06e0e96f4298ff9f63456101980"],
	["tap",            "Test Anything Protocol",  "50408c27521157418863e7d5880f6509d5385220872301bb8e6a14a7f631b216332012bbccc6bc47edd02a57703f57809e02289fd1bdd6cbb402129c11970ef2"],
	["tcl",            "Tcl",                     "18bd01211c955c79772878b392dc22ea1f3f5b9c45ed675d6dcce235bc6e310e4cb300c370915a93c93a2a2c0b9bba32e3021b24731a829c72f3d5805da26153"],
	["thrift",         "Thrift",                  "3245455cbb9b477c4dc48a4c53793aa855755f053cdd40428e6b871e20e804a4d0df52ee0b596f47f9608aaabbab5c11ce492bd40cb30c83daaf534e2bc8f2b2"],
	["tp",             "TP",                      "b5f2ec920d0bbbe72fa45041bb2c5f0caf7a5b5489d450903a5caf33f599dfb977e33c13f06cf0a95986b227a1bed614de1de43d5036d362773de5a714755877"],
	["twig",           "Twig",                    "e67a179a28aa461139d3ee45f394fc18dba5d9b0d22b56b265da2d4334b5ba486c487f17dd1d6cfe00990e4ab1770fb3b429e45aae0642e42c829e554eaf8868"],
	["typescript",     "TypeScript",              "e69ce04a9a0ed994e71bcb7c722b8db375ebccfae19bfe16832412206e8384ff634fdc3b16e1232be748020b77f53a9467f2437131f14b484e9b4c2c28a4ef48"],
	["vala",           "Vala",                    "5865ede410bc12aeba0cb7dcc055d83c35c0c64a9b3cb114fb68e128911d6b3147fdce316f786cc2adfbd526150febecc647f980c9584b60040c73e3499596a7"],
	["vbnet",          "VB.NET",                  "b6665556e72bb1aae88c8fff06d2a90f85b73454125e4b3eeb55dc8c4dcc1ceb9f37ae8bb900ff238c735d9c9199095cd6d2148946027aaa63fad3fb54071588"],
	["vbscript-html",  "VBScript HTML",           "7ecab3aae1ad789eff7c43cdbc96a724732c8e3456772bb2ae094e6a9be44d466fd89f9d53da8142193ae83a582b32370666fb8110ebc8253f55a6fab167a7f6"],
	["vbscript",       "VBScript",                "9713ee514738292fb8409500ca50fd2ee7f44e3b25dc0f28c370863294891d17e085bcfe26a17c1c90a2d6eb1ad2777388661e0a6c12a9455f357f3ecce47117"],
	["verilog",        "Verilog",                 "7eb003518d6c9452ef00380256853ce539b77499aea8275e109423d0170fe6cb1d135745380457829b15caa102cf0450c9ea44444d50fa01201abd2340161cde"],
	["vhdl",           "VHDL",                    "08592d089f7224d25b6ae59c5040e6df9338b1b69b076e944073fbecb667087e2d7fc652a1ae37e219eb983414a0bdd61f77b894c64ec8f65c13922c2b3631b9"],
	["vim",            "Vim Script",              "70abfc3619d4f10f6e3a61f2e7b00772d3cde4e6ab040a16f71b017c51cf1c482ca08be59e16989c6635743d07ba2c53ae15afda4eb99f99d4e00d0d0d6c8992"],
	["wasm",           "Web Assembly",            "d120054a8658e07927932c8b063375587850f8fe1127b78a5291e7db7792a4e7312f5c1421dd0fe6bf8b7db473c038545165adf6fdd57151a6ba3f60f6bd383b"],
	["wren",           "Wren",                    "110f426d6c4d2c247fca8c1c6a3630fb2229db8b37609793c136c63317b930e242996fabc53d12f8d8760672ad758b25c64fc6fa59f71671098ea7276ee66dbe"],
	["axapta",         "X++",                     "c22697830701a66e1b3ceb3287ccfe0c98529790e9388ea184b825b2a8ed7bf6aa1ed795f654bbed8c2de7db88a0306d8af8ed72a1ac6a6645e08582aef6c5ae"],
	["x86asm",         "X86 Assembly",            "01ddc46d6cae2a99a0f52ebb724a9cd972caa260b3abb908c55208afb010756c2baa0fcbfb16ea27461c4bbf65bd85ffc24e25f804943862ee0eeefbd1e9857b"],
	["xl",             "XL",                      "4c53a4a9f41fd8ccdd96cfd3e2c828533dd2b121a8fe0a2add9d3249d072510e4dca69faa883965a5c4219a53a5acc718f395d13a3d2d71a8b2ddb1d3d0d586f"],
	["xquery",         "XQuery",                  "a0c637b0215185c0d9b6b96b5754ce54182a5744dff3778ef5fbba1ee1401707e75c98aac357e80301b6bb6161aabc658a1ed274ffcab3cccf8812426ffb3954"],
	["yaml",           "YAML",                    "f86329dd87c210f59adb2684e553889536f712082db76bb9370abc6017173777e8a26cd5b385da353c6edbe534627c52cb9e166ea3d05d590f719872f042d22b"],
	["zephir",         "Zephir",                  "373b80d140e45d8c65178fef434e8c687351e460df95fa5e29a0d7c75de5e41f10ed08022659dadbaed861140b2f542b2b98607c3fde26fc83e852721270225f"],
];

export function getCachePath(ext: Extension | ExtensionPreferences): Gio.File {
	return Gio.file_new_build_filenamev([GLib.get_user_cache_dir(), ext.uuid]);
}

export function getDataPath(ext: Extension | ExtensionPreferences): Gio.File {
	return Gio.file_new_build_filenamev([GLib.get_user_data_dir(), ext.uuid]);
}

export function getImagesPath(ext: Extension | ExtensionPreferences): Gio.File {
	return getDataPath(ext).get_child('images');
}

export function getConfigPath(ext: Extension | ExtensionPreferences): Gio.File {
	return Gio.file_new_build_filenamev([GLib.get_user_config_dir(), ext.uuid]);
}

export function getActionsConfigPath(ext: Extension | ExtensionPreferences): Gio.File {
	return getConfigPath(ext).get_child('actions.json');
}

export function getDefaultDatabaseFile(ext: Extension | ExtensionPreferences, backend: DatabaseBackend): Gio.File {
	return backend === DatabaseBackend.Json
		? getDataPath(ext).get_child('clipboard.json')
		: getDataPath(ext).get_child('clipboard.db');
}

export function getHljsPath(ext: Extension | ExtensionPreferences): Gio.File {
	const sysPath = ext.dir.get_child('highlight.min.js');
	if (sysPath.query_exists(null)) {
		return sysPath;
	}

	return getDataPath(ext).get_child('highlight.min.js');
}

/**
 * Get the list of supported highlight.js languages.
 * @param ext The extension or preferences
 * @returns A list of:
 * - language id
 * - language name
 * - file hash
 * - file path
 * - boolean indicating system install
 */
export function getHljsLanguages(ext: Extension | ExtensionPreferences): [string, string, string, Gio.File, boolean][] {
	const sysPath = ext.dir.get_child('languages');
	const path = getDataPath(ext).get_child('languages');
	return HljsLanguages.map(([language, name, hash]) => {
		const sysFile = sysPath.get_child(`${language}.min.js`);
		if (sysFile.query_exists(null)) return [language, name, hash, sysFile, true];
		return [language, name, hash, path.get_child(`${language}.min.js`), false];
	});
}

export function getHljsLanguageUrls(language: string): string[] {
	return HljsCdns.map((cdn) => `${cdn}/languages/${language}.min.js`);
}
