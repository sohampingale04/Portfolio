/* ==========================================================================
   content.js

   Everything you are likely to edit lives here. app.js reads window.SITE.

   Each node:
     id       unique, lowercase, no spaces (used for DOM ids and linking)
     title    serif heading on the card
     summary  one or two lines shown on the closed card
     glyph    one of: ledger, prism, lattice, curve, stack, arch, quill, compass, envelope
     x, y     position in world units. The hub is at (0, 0); +x is right, +y is down.
              Positions are multiplied by a layout scale on small screens.
     parent   id of the node this one branches from, or null to branch from the hub
     lead     opening paragraph in the expanded card (serif)
     items    list of entries: { title, meta?, text?, href? }
     note     optional closing line

   The hero copy (name, role, bio) is plain HTML in index.html.
   Colours and fonts are CSS variables at the top of styles.css.
   ========================================================================== */

window.SITE = {
  nodes: [

    /* ---- Ring one: branches straight from the hub ---------------------- */

    {
      id: 'experience',
      title: 'Experience',
      summary: 'Supply Chain Finance · Corporate & Investment Banking.',
      glyph: 'ledger',
      x: -780, y: -380, parent: null,
      lead: 'I am beginning my career in banking with Standard Chartered, working in Supply Chain Finance within Corporate & Investment Banking. My engineering background brings a technical perspective to financial products, processes and problem-solving.',
      items: [
        {
          title: 'Apprentice Supply Chain Finance, Standard Chartered',
          meta: 'October 2026 - Present',
          text: 'Part of Corporate & Investment Banking, learning how supply chain finance supports businesses, buyers and suppliers through working-capital solutions.'
        },
        {
          title: 'Areas I am learning',
          meta: 'Banking · Credit · Financial Statements',
          text: 'Building practical understanding of balance sheets, income statements, working capital, trade flows, credit risk and the fundamentals behind SCF products.'
        }
      ],
      note: 'Early-career experience; responsibilities and learning will evolve.'
    },

    {
      id: 'projects',
      title: 'Projects',
      summary: 'Portfolio optimisation, investor profiling and financial ML.',
      glyph: 'prism',
      x: 130, y: -570, parent: null,
      lead: 'I use projects to connect engineering, machine learning and finance. The emphasis is on making the modelling process understandable, testing ideas with data and being clear about limitations.',
      items: 
      [
        {
          title: 'AssetOS',
          meta: 'Portfolio Optimisation · Major Engineering Project',
          text: 'An RL-based portfolio optimisation system built around Modern Portfolio Theory and the Black–Litterman framework, with Monte Carlo simulation and a RecurrentPPO-based rebalancing approach. Developed using NSE equity data.'
        },
        
        {
          title: 'Portfolio Management Chatbot',
          meta: 'Portfolio Management Chatbot',
          text: 'A portfolio-management assistant combining market data, rule-based investor profiling and a 31-question assessment to generate an Investment Policy Statement (IPS).'
        },
        
        {
          title: 'Loan Approval Prediction',
          meta: 'Machine Learning · Research Project',
          text: 'A classification study exploring machine-learning approaches to loan approval prediction, including data preparation, model comparison and evaluation.'
        },
        {
          title: 'Many more projects',
          text: "including: Credit Spread Forecasting, Interest Rate Modelling, Option Pricing, and Financial Risk Analysiss"
        }
        
      
      ]
    },

    // {
    //   id: 'research',
    //   title: 'Research',
    //   summary: 'Hyperparameter search and calibration drift in finance.',
    //   glyph: 'lattice',
    //   x: 900, y: -250, parent: null,
    //   lead: 'Applied research on how model choice and hyperparameter search interact with financial data, where leakage and non-stationarity punish careless tuning.',
    //   items: [
    //     {
    //       title: 'Purged Bayesian Search under Temporal Leakage',
    //       meta: 'Journal paper, 2025',
    //       text: 'Shows that standard cross-validation can inflate reported Sharpe ratios by as much as 0.4, and proposes a purged, embargoed search procedure that is cheap to adopt.'
    //     },
    //     {
    //       title: 'Gradient Boosting for Credit Spread Forecasting',
    //       meta: 'Conference paper, 2025',
    //       text: 'A comparison of tree ensembles and linear baselines across three credit regimes, with attention to calibration rather than headline accuracy.'
    //     },
    //     {
    //       title: 'Calibration Drift in Short-Rate Models',
    //       meta: 'Working paper',
    //       text: 'Measures how quickly Vasicek and CIR parameters decay after calibration and suggests a recalibration schedule driven by observed drift.'
    //     }
    //   ]
    // },

    {
      id: 'models',
      title: 'Quantitative Models',
      summary: 'Portfolio optimisation, stochastic rates and financial risk.',
      glyph: 'curve',
      x: 800, y: 420, parent: null,
      // lead: 'Models I know well enough to explain where they fail. For each one I keep a short note on what it assumes, what it ignores, and what the market did the last time it was wrong.',
      lead: 'My quantitative modelling interests span portfolio construction, stochastic interest-rate modelling and financial risk. Through projects and independent exploration, I study how mathematical frameworks translate into financial insights, while remaining conscious of their assumptions and limitations.',
      items: [
        {
          title: 'Short-rate models',
          meta: 'CIR, Hull–White',
          text: 'Studying short-rate dynamics, interest-rate modelling, bond pricing, mean reversion, and the role of volatility in modelling the term structure of interest rates.'
        },
        {
          title: 'Option Pricing',
          meta: 'Black–Scholes',
          text: 'Understanding European option pricing under the Black–Scholes framework, the relationship between option prices and implied volatility, and the assumptions and limitations of the model.'
        },
        {
          title: 'Portfolio construction',
          meta: 'Mean–variance, Black–Litterman',
          text: 'Exploring risk–return trade-offs, portfolio allocation, covariance estimation and the incorporation of investor views through the Black–Litterman framework. Applied within AssetOS using NSE equity data.'
        },
        {
          title: 'Financial Risk',
          meta: 'VaR, Expected Shortfall',
          text: 'Studying market-risk measurement through Value at Risk and Expected Shortfall, including the interpretation of portfolio losses and tail risk.'
        },
        {
          title: 'Interest Rate Modelling',
          meta: 'Vasicek · Stochastic Processes',
          text: 'Implementing the Vasicek short-rate model using EFFR data from FRED. Exploring mean-reversion parameters, long-run rate, volatility, calibration and the half-life of interest-rate shocks.'
        },
        {
          title: 'Monte Carlo Simulation',
          meta: 'Simulation · Portfolio Analysis',
          text: 'Using simulation to explore uncertainty, stochastic outcomes and portfolio behaviour, including its application within portfolio optimisation.'
        },
      ]
    },

    {
      id: 'stack',
      title: 'Technical Stack',
      summary: 'Python, machine learning and analytical tooling.',
      glyph: 'stack',
      x: -60, y: 570, parent: null,
      lead: 'My toolkit is rooted in Python and its data-science ecosystem, with a focus on analysis, modelling and experimentation.',
      items: 
      [
        {
          title: 'Programming',
          text: 'Python; foundational computer-engineering and programming concepts.'
        },
        
        {
          title: 'Data and analysis',        
          text: 'Pandas, NumPy, Jupyter Notebook, data cleaning, exploratory analysis and visualisation.'
        },
        
        {
          title: 'Machine learning',
          text: 'Scikit-learn, TensorFlow/Keras, model training, evaluation and feature engineering.'
        },  
        
        {
          title: 'Finance and modelling',
          text: 'Financial data analysis (learning), portfolio optimisation concepts, Monte Carlo simulation and quantitative model implementation.'
        }
      ]
    },

    {
      id: 'education',
      title: 'Education',
      summary: 'Computer Engineering · Financial Engineering.',
      glyph: 'arch',
      x: -830, y: 330, parent: null,
      lead: 'I studied Computer Engineering and built a foundation in programming, data structures, mathematics and systems. Alongside engineering, I pursued financial engineering to bring quantitative methods closer to financial markets.',
      items: 
      [
        {
          title: 'B.Tech Computer Engineering',
          meta: 'K. J. Somaiya Institute of Information Technology · 2026',
          text: 'Graduated with a CGPA of 8.84.'
        },
        
        {
          title: 'Certificate Program in Financial Engineering',
          meta: 'IIQF',
          text: 'Training in financial engineering and quantitative finance concepts.'
        },
        
        {
          title: 'CFA Level I',
          meta: 'Exam attempted',
          text: 'Studied investment analysis, financial reporting, economics, ethics and portfolio management through the Level I curriculum.'
        }
      ]
    },


    /* ---- Ring two: branches from a ring-one node ----------------------- */

    {
      id: 'writing',
      title: 'Learning Notes',
      summary: 'Concepts I explore across finance, data and technology.',
      glyph: 'quill',
      x: 900, y: -250, parent: null,
      lead: 'This space represents the subjects I keep returning to while learning and building. It is a record of curiosity rather than a list of published articles.',
      items: [
        {title: 'Quantitative Finance',text: 'Financial mathematics, stochastic processes, interest-rate models and quantitative risk.'},
        {title: 'Machine Learning',text: 'Model selection, validation, feature engineering and the limits of predictive performance.'},
        {title: 'Financial Markets',text: 'How market structure, instruments, risk and capital allocation connect to real-world financial decisions.'},
        {title: 'Financial Systems & Trade',text: 'How banking, working capital, trade finance and technology intersect to facilitate global commerce and shape corporate liquidity.'}
      ]
    },

    {
      id: 'principles',
      title: 'Principles',
      summary: 'How I approach learning, modelling and building.',
      glyph: 'compass',
      x: -1580, y: -120, parent: 'experience',
      lead: 'A few working principles that guide how I approach problems.',
      items: [
        { title: 'Write the assumptions down first', text: 'If they do not fit on one page, the model is not understood well enough to ship.' },
        { title: 'Prefer the model you can explain to a risk manager', text: 'A slightly worse model that people trust beats a better one they route around.' },
        { title: 'Treat every backtest as guilty until proven innocent', text: 'Leakage, survivorship and selection are the default explanations for good results.' },
        { title: 'Ship the monitoring with the model', text: 'A model without drift checks is a liability with a delay.' },
        {title: 'Understand before optimising',text: 'Start with the problem, assumptions and baseline before reaching for a complex model.'},
        {title: 'Keep the evidence visible',text: 'Use data, evaluation and clear reasoning to support conclusions.'},
        {title: 'Build, test and iterate',text: 'Turn ideas into working experiments, learn from results and improve them.'}
      ]
    },

    {
      id: 'contact',
      title: 'Contact',
      summary: 'Connect for finance, quantitative research and technology.',
      glyph: 'envelope',
      x: -480, y: 1100, parent: 'stack',
      lead: 'I am interested in connecting with people working across finance, quantitative research, machine learning and financial technology.',
      items: [
        { title: 'sohampingale04@gmail.com', href: 'mailto:sohampingale04@gmail.com', meta: 'Email' },
        { title: 'Linkedin', href: 'https://www.linkedin.com/in/soham-pingale-9232a2258/', meta: 'LinkedIn' }
      ],
    }

  ]
};
