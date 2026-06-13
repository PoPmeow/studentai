from assistant.modules import budget

# reset test budget back to empty so the user sets their own
budget.set_budgets(monthly=0, categories={})
print("budget reset:", budget.get_budgets())
