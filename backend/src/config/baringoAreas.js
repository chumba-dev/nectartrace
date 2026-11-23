const USSD_PAGE_SIZE = 4;

const BARINGO_WARDS = Object.freeze([
  Object.freeze({ id: 'kabarnet', ward: 'Kabarnet', subCounty: 'Baringo Central' }),
  Object.freeze({ id: 'sacho', ward: 'Sacho', subCounty: 'Baringo Central' }),
  Object.freeze({ id: 'tenges', ward: 'Tenges', subCounty: 'Baringo Central' }),
  Object.freeze({ id: 'ewalel-chapchap', ward: 'Ewalel Chapchap', subCounty: 'Baringo Central' }),
  Object.freeze({ id: 'kabartonjo', ward: 'Kabartonjo', subCounty: 'Baringo North' }),
  Object.freeze({ id: 'barwessa', ward: 'Barwessa', subCounty: 'Baringo North' }),
  Object.freeze({ id: 'marigat', ward: 'Marigat', subCounty: 'Baringo South' }),
  Object.freeze({ id: 'mochongoi', ward: 'Mochongoi', subCounty: 'Baringo South' }),
  Object.freeze({ id: 'eldama-ravine', ward: 'Eldama Ravine', subCounty: 'Koibatek' }),
  Object.freeze({ id: 'mogotio', ward: 'Mogotio', subCounty: 'Mogotio' }),
  Object.freeze({ id: 'chemolingot', ward: 'Chemolingot', subCounty: 'Tiaty East' }),
  Object.freeze({ id: 'tangulbei', ward: 'Tangulbei', subCounty: 'Tiaty East' }),
]);

module.exports = { BARINGO_WARDS, USSD_PAGE_SIZE };
