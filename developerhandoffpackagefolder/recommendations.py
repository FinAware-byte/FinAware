def n(d,k,default=0.0):
    try:return float(d.get(k,default))
    except:return default

def generate_recommendations(d,tier):
    income=n(d,'monthly_income_zar'); expenses=n(d,'monthly_expenses_zar'); savings=n(d,'savings_zar'); emi=n(d,'monthly_emi_zar'); loan=n(d,'loan_amount_zar'); credit=d.get('credit_score')
    er=expenses/income if income else 1; sr=savings/income if income else 0; em=emi/income if income else 0; dti=d.get('debt_to_income_ratio',loan/income if income else 0)
    if credit is not None: credit=n(d,'credit_score')
    r=[]
    def add(p,c,rule,msg): r.append({'priority':p,'category':c,'rule':rule,'recommendation':msg})
    if er>.8:add('High','Expenses','expense_to_income_ratio > 0.80','Review discretionary spending and create a monthly expense-reduction plan.')
    if er>1:add('Critical','Cash Flow','expense_to_income_ratio > 1.00','Monthly expenses exceed income; prioritise immediate cash-flow stabilisation.')
    if sr<.1:add('High','Savings','savings_to_income_ratio < 0.10','Increase the monthly savings allocation, starting with a manageable fixed amount.')
    if dti>.4:add('High','Debt','debt_to_income_ratio > 0.40','Prioritise reducing high-cost debt and avoid unnecessary new debt.')
    if em>.25:add('High','Debt','monthly_emi_to_income_ratio > 0.25','Review monthly debt repayments and assess whether repayment restructuring may be appropriate.')
    if credit is not None and credit<580:add('High','Credit','credit_score < 580','Prioritise consistent on-time payments and reduce outstanding balances where possible.')
    messages={'High':'Create a short-term financial stabilisation plan covering cash flow, debt and emergency savings.','Medium':'Focus on reducing debt burden and increasing the financial buffer before taking on new obligations.','Low':'Maintain healthy savings, manageable debt and sustainable spending patterns.'}
    add('High' if tier=='High' else 'Medium' if tier=='Medium' else 'Low','Financial Health',f'risk_tier == {tier}',messages[tier])
    order={'Critical':0,'High':1,'Medium':2,'Low':3}; r.sort(key=lambda x:order[x['priority']]); return r[:8]
