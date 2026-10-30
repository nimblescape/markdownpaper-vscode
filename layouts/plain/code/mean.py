# SPDX-License-Identifier: MIT
# © 2026 Hannes Stauss (scalarion@nimblescape.com)
# Licensed under the MIT License. See LICENSE in the repository root for details.

def mean(grades):
    """Returns the mean of a list of grades."""
    return sum(grades) / len(grades)


print(mean([1, 2, 2, 3, 1]))
