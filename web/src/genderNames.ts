// Sexo del brute de un espectador según su usuario de TikTok (ver addBrute en sim.ts). TikTok no dice el sexo de nadie,
// así que es solo una suposición: si el usuario lleva un nombre de pila conocido ("sofi_gamer", "migue73", "elpepe"),
// el de ese nombre; si no, o si el nombre vale para los dos (Alex, Dani, Andrea, Ángel...), nada, y sale al azar
type Gender = 'male' | 'female';

const FEMALE = `
  maria mari mary marie ana anna anita sofia sofi sophia sophie valentina vale valeria camila cami isabella isabela
  isabel luciana lucia martina mariana marina daniela danielle gabriela gabrielle gaby fernanda paula paulina paola
  pao ximena jimena regina renata natalia nati nataly natalie alejandra alexa alexandra karla carla karina carolina
  caro diana laura elena lorena monica veronica vero patricia paty pati rosa rosy rocio roxana sandra silvia susana
  tania tatiana adriana alicia angela angie angelica ariana arianna belen brenda carmen catalina cata cecilia cielo
  claudia cristina dayana dulce emilia emily emma esmeralda esperanza estefania fany fabiola fatima flor florencia
  frida gisela gloria guadalupe lupita lupe ingrid irene iris itzel jazmin jasmin jessica jesica joana johana josefina
  josefa juana julia juliana julieta karen kathy katy kimberly leticia lety liliana lili lizbeth liz lola luisa luz
  magdalena maite manuela marcela margarita maribel marisol marta martha melanie melany melissa mercedes micaela
  michelle milagros miriam mirna nadia nancy nayeli nicole noemi norma olga pamela perla pilar priscila rafaela ramona
  raquel rebeca sabrina samanta samantha sara sarah selena sharon sonia stephanie tamara teresa tere vanesa vanessa
  victoria vicky viviana wendy yesenia yolanda yuliana zoe abril aitana alma amanda antonella antonia agustina aurora
  barbara bianca blanca constanza delfina eva evelyn francisca gina graciela ines ivana ivanna jade jenny jennifer
  kiara lara leila leonela luna mia mila nerea nora oriana rosario ruth salome xiomara yamila abigail adela alba
  allison amparo anahi araceli azul beatriz betty brisa candela clara consuelo daisy debora dolores elisa elizabeth
  estela estrella ester eugenia gladys grecia hilda jacqueline janet jaqueline karol katherine kelly lizeth lourdes
  marlene milena naomi nahomi nelly nina paloma rosalia sol soledad valery wanda yadira yasmin yazmin zulema
  reina princesa queen lady miss chica nena gatita mami morra mujer girl senora senorita
`;

const MALE = `
  jose juan carlos luis miguel migue jesus chuy pedro pablo jorge javier javi francisco paco pancho franco antonio
  manuel manu ricardo richi roberto beto rafael rafa raul ramon fernando sergio eduardo lalo enrique kike alejandro
  alexander diego daniel david mario mariano marino marco marcos martin mateo matias santiago santi sebastian sebas
  nicolas nico tomas lucas gabriel gabo emiliano emilio emmanuel emanuel ivan hugo oscar victor adrian alberto alfredo
  alfonso andres armando arturo benjamin bruno camilo cesar cristian christian cristobal dario eric erick esteban
  ezequiel felipe gerardo german gilberto gonzalo guillermo memo gustavo hector hernan ignacio nacho isaac jaime joel
  jonathan jonatan josue julian julio kevin leonardo leonel leo lorenzo luciano marcelo mauricio maximiliano maxi
  moises nelson omar orlando osvaldo paolo patricio pepe renato ruben rodrigo salvador samuel saul simon tito ulises
  valentin vicente walter xavier yahir axel brandon bryan brian dylan ethan joshua jacob john mike michael peter paul
  tony jhon jhonny johnny juanito pepito luisito carlitos panchito chava chente alan aaron abel abraham agustin alonso
  anibal bernardo braulio damian edgar efrain elias eliseo enzo ernesto fabian fabricio federico fidel gael horacio
  ismael israel jairo jeronimo joaquin leandro lucio matteo milton misael nahuel nestor octavio ramiro rigoberto
  rogelio romeo roman santino thiago tiago uriel wilson yair
  rey principe king lord senor don chico papi hombre boy
`;

// Apellidos y nombres de los dos que empiezan como uno de los de arriba ("hernandez" como "hernan", "valencia" como
// "vale", "alexis" como "alexa"): con ellos no se adivina
const NEUTRAL = ['martinez', 'hernandez', 'valencia', 'rosales', 'marin', 'alexis', 'marion'];

const NAMES = new Map<string, Gender>([
  ...MALE.split(/\s+/)
    .filter(Boolean)
    .map((n) => [n, 'male'] as [string, Gender]),
  ...FEMALE.split(/\s+/)
    .filter(Boolean)
    .map((n) => [n, 'female'] as [string, Gender]),
]);

// El nombre exacto, o el más largo (de 4 letras o más) con el que empiece la palabra: "sofigamer", "emmanuelxd" (no
// "emma"), "paulinagamer" (no "paul"). Salvo si con una letra menos es un nombre del otro sexo: "juanarboleda" puede
// ser Juan o Juana, y "danielagomez", Daniel o Daniela
const lookup = (word: string): Gender | undefined => {
  if (NAMES.has(word)) return NAMES.get(word);
  if (NEUTRAL.some((n) => word.startsWith(n))) return undefined;
  for (let n = Math.min(word.length - 1, 12); n >= 4; n--) {
    const gender = NAMES.get(word.slice(0, n));
    if (!gender) continue;
    const shorter = NAMES.get(word.slice(0, n - 1));
    return shorter && shorter !== gender ? undefined : gender;
  }
  return undefined;
};

export function genderOfName(user: string): Gender | undefined {
  // Sin tildes ni mayúsculas, y por palabras ("sofi_gamer.mx" → sofi, gamer, mx; "migue73" → migue)
  const words = user
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  for (const word of words) {
    // (también sin un "el", "la" o "soy" delante: "elpepe", "soysofi")
    const found = lookup(word) ?? lookup(word.replace(/^(el|la|soy|its|im|iam|the)/, ''));
    if (found) return found;
  }
  return undefined;
}
