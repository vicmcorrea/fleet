# Badge Collector R Markdown equivalent
# R script for Kaggle badge collection

library(datasets)

# Load and analyze iris data
data(iris)
cat("=== Iris Dataset Summary ===\n")
print(summary(iris))

# Group means by species
cat("\n=== Species Means ===\n")
print(aggregate(. ~ Species, data = iris, FUN = mean))

# Generate output
cat("\nR script completed successfully\n")
