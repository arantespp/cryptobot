import '../src/config';

import { getStrategyData } from '../src/api/binance';
import {
  getWalletProportionTickers,
  getExtremeProportions,
  getWalletProportion,
} from '../src/strategy/first';

(async () => {
  const walletProportion = await getWalletProportion();

  const tickers = getWalletProportionTickers(walletProportion);

  const strategyData = await getStrategyData(tickers);

  const extremeProportions = getExtremeProportions({
    strategyData,
    walletProportion,
  });

  console.log(extremeProportions);
})();
