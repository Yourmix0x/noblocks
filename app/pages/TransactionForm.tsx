"use client";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import { ImSpinner, ImSpinner3 } from "react-icons/im";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

import {
  AnimatedComponent,
  primaryBtnClasses,
  slideInOut,
  FormDropdown,
  RecipientDetailsForm,
  KycModal,
  FundWalletForm,
  AnimatedModal,
} from "../components";
import { BalanceSkeleton } from "../components/BalanceSkeleton";
import type { TransactionFormProps, Token } from "../types";
import { acceptedCurrencies } from "../mocks";
import {
  classNames,
  fetchSupportedTokens,
  formatNumberWithCommas,
  currencyToCountryCode,
  reorderCurrenciesByLocation,
} from "../utils";
import { ArrowDown02Icon, NoteEditIcon, Wallet01Icon } from "hugeicons-react";
import { useSwapButton } from "../hooks/useSwapButton";
import { fetchKYCStatus, fetchRate } from "../api/aggregator";
import { useFundWalletHandler } from "../hooks/useFundWalletHandler";
import { useBalance, useInjectedWallet, useNetwork } from "../context";

/**
 * TransactionForm component renders a form for submitting a transaction.
 * It includes fields for selecting network, token, amount, and recipient details.
 * The form also displays rate and fee information based on the selected token.
 *
 * @param formMethods - Form methods from react-hook-form library.
 * @param onSubmit - Function to handle form submission.
 * @param stateProps - State properties for the form.
 */
export const TransactionForm = ({
  stateProps,
  formMethods,
  onSubmit,
  isUserVerified,
  setIsUserVerified,
}: TransactionFormProps & {
  isUserVerified: boolean;
  setIsUserVerified: (v: boolean) => void;
}) => {
  const searchParams = useSearchParams();
  // Destructure stateProps
  const { rate, isFetchingRate, setOrderId } = stateProps;
  const { authenticated, ready, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { selectedNetwork } = useNetwork();
  const { smartWalletBalance, injectedWalletBalance, isLoading } = useBalance();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();

  const embeddedWalletAddress = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  )?.address;

  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const [isReceiveInputActive, setIsReceiveInputActive] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [formattedSentAmount, setFormattedSentAmount] = useState("");
  const [formattedReceivedAmount, setFormattedReceivedAmount] = useState("");
  const isFirstRender = useRef(true);
  const [rateError, setRateError] = useState<string | null>(null);

  const currencies = useMemo(
    () =>
      acceptedCurrencies.map((item) => {
        const countryCode = currencyToCountryCode(item.name);
        return {
          ...item,
          imageUrl: `https://flagcdn.com/h24/${countryCode}.webp`,
        };
      }),
    [],
  );

  // state for reordered currencies
  const [orderedCurrencies, setOrderedCurrencies] = useState(currencies);

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid, isDirty },
  } = formMethods;
  const { amountSent, amountReceived, token, currency } = watch();

  const activeWallet = isInjectedWallet
    ? { address: injectedAddress }
    : user?.linkedAccounts.find((account) => account.type === "smart_wallet");

  const activeBalance = isInjectedWallet
    ? injectedWalletBalance
    : smartWalletBalance;

  const balance = activeBalance?.balances[token] ?? 0;

  const { handleFundWallet } = useFundWalletHandler("Transaction form");

  const handleFundWalletClick = async (
    amount: string,
    tokenAddress: `0x${string}`,
    onComplete?: (success: boolean) => void,
  ) => {
    await handleFundWallet(
      activeWallet?.address ?? "",
      amount,
      tokenAddress,
      onComplete,
    );
  };

  const fetchedTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];

  const tokens = fetchedTokens.map((token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));

  const handleBalanceMaxClick = () => {
    if (balance > 0) {
      const maxAmount = balance.toFixed(4);
      setValue("amountSent", parseFloat(maxAmount), {
        shouldValidate: true,
        shouldDirty: true,
      });
      setIsReceiveInputActive(false);
    }
  };

  // Improved function to format number with commas while preserving decimal places
  const formatNumberWithCommasForDisplay = (value: number | string): string => {
    if (value === undefined || value === null || value === "") return "";

    const valueStr = value.toString();
    if (valueStr === "0") return "0";

    // Handle case when input is just a decimal point
    if (valueStr === ".") return "0.";

    const parts = valueStr.split(".");
    // Add commas to the integer part
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    // Preserve the decimal part if it exists, ensuring max 4 decimal places
    if (parts.length > 1) {
      const decimalPart = parts[1].slice(0, 4); // Limit to 4 decimal places
      return `${integerPart}.${decimalPart}`;
    }

    return integerPart;
  };

  // Remove commas for calculation and validation
  const removeCommas = (value: string): string => {
    return value.replace(/,/g, "");
  };

  useEffect(function setDefaultValueOnPageLoad() {
    const token = searchParams.get("token");
    const currency = searchParams.get("currency");
    const tokenAmount = +parseFloat(
      searchParams.get("tokenAmount") || "0",
    ).toFixed(2);
    const fiatAmount = +parseFloat(
      searchParams.get("fiatAmount") || "0",
    ).toFixed(2);

    const supportedTokens = tokens.map((tokenElement) => tokenElement.name);
    if (token && supportedTokens.includes(token)) {
      formMethods.setValue("token", token, { shouldDirty: true });
    }

    // Check's if not first render to prevent display of error 2nd time
    if (!isFirstRender.current && token && !supportedTokens.includes(token)) {
      toast.error("Unsupported Token", {
        description: String(
          `${token} token is not supported on the current network.`,
        ),
      });
    }
    if (currency) {
      const supported = currencies.find(
        (c) => c.name === currency && !c.disabled,
      );

      if (supported)
        formMethods.setValue("currency", currency, { shouldDirty: true });
    }
    if (tokenAmount && fiatAmount) {
      formMethods.setValue("amountReceived", fiatAmount, { shouldDirty: true });
      setIsReceiveInputActive(true);
    } else if (tokenAmount) {
      formMethods.setValue("amountSent", tokenAmount, { shouldDirty: true });
    } else if (fiatAmount) {
      formMethods.setValue("amountReceived", fiatAmount, { shouldDirty: true });
      setIsReceiveInputActive(true);
    }
    // Setting first render to false
    isFirstRender.current = false;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    function initSelectedToken() {
      if (
        !fetchedTokens.find((t) => t.symbol === token) &&
        fetchedTokens.length > 0
      ) {
        setValue("token", fetchedTokens[0].symbol, { shouldDirty: true });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedNetwork.chain.name],
  );

  useEffect(
    function checkKycStatus() {
      const walletAddressToCheck = isInjectedWallet
        ? injectedAddress
        : embeddedWalletAddress;
      if (!walletAddressToCheck) return;

      const fetchStatus = async () => {
        try {
          const response = await fetchKYCStatus(walletAddressToCheck);
          if (response.data.status === "pending") {
            setIsKycModalOpen(true);
          } else if (response.data.status === "success") {
            setIsUserVerified(true);
          }
        } catch (error) {
          if (
            error instanceof Error &&
            (error as any).response?.status === 404
          ) {
            // silently fail if user is not found/verified
          } else {
            console.log("error", error);
          }
        }
      };

      fetchStatus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [embeddedWalletAddress, injectedAddress, isInjectedWallet],
  );

  useEffect(
    function updateFormattedAmounts() {
      if (amountSent !== undefined) {
        setFormattedSentAmount(formatNumberWithCommasForDisplay(amountSent));
      }

      if (amountReceived !== undefined) {
        setFormattedReceivedAmount(
          formatNumberWithCommasForDisplay(amountReceived),
        );
      }
    },
    [amountSent, amountReceived],
  );

  // calculate receive amount based on send amount and rate
  useEffect(
    function calculateReceiveAmount() {
      if (rate && (amountSent || amountReceived)) {
        if (isReceiveInputActive) {
          const calculatedAmount = Number(
            (Number(amountReceived) / rate).toFixed(4),
          );
          setValue("amountSent", calculatedAmount, { shouldDirty: true });
        } else {
          const calculatedAmount = Number((rate * amountSent).toFixed(2));
          setValue("amountReceived", calculatedAmount, { shouldDirty: true });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [amountSent, amountReceived, rate],
  );

  // Register form fields
  useEffect(
    function registerFieldsWithValidation() {
      async function registerFormFields() {
        let maxAmountSentValue = 10000;
        let minAmountSentValue = 0.5;

        if (token === "cNGN") {
          try {
            const rate = await fetchRate({
              token: "USDC",
              amount: 1,
              currency: "NGN",
              network: selectedNetwork.chain.name
                .toLowerCase()
                .replace(/\s+/g, "-"),
            });

            if (
              rate?.data &&
              typeof rate.data === "string" &&
              Number(rate.data) > 0
            ) {
              maxAmountSentValue = 10000 * Number(rate.data);
              minAmountSentValue = 0.5 * Number(rate.data);
              setRateError(null); // Clear error on success
            }
          } catch (error: any) {
            setRateError(error?.message || "Unknown error");
            toast.error("No available quote", {
              description: error?.message || "Unknown error",
            });
          }
        }

        formMethods.register("amountSent", {
          required: { value: true, message: "Amount is required" },
          disabled: !token,
          min: {
            value: minAmountSentValue,
            message: `Minimum amount is ${formatNumberWithCommas(minAmountSentValue)}`,
          },
          max: {
            value: maxAmountSentValue,
            message: `Maximum amount is ${formatNumberWithCommas(maxAmountSentValue)}`,
          },
          validate: {
            decimals: (value: number) => {
              const decimals = value.toString().split(".")[1];
              return (
                !decimals ||
                decimals.length <= 4 ||
                "Maximum 4 decimal places allowed"
              );
            },
          },
        });

        formMethods.register("amountReceived", {
          disabled: !token || !currency,
        });

        formMethods.register("memo", {
          required: { value: false, message: "Add description" },
        });

        if (token === "cNGN") {
          // When cNGN is selected, only enable NGN
          currencies.forEach((currency) => {
            currency.disabled = currency.name !== "NGN";
          });
          // If the selected currency is not NGN, set it to NGN
          if (currency !== "NGN") {
            formMethods.setValue("currency", "NGN", { shouldDirty: true });
          }
        } else {
          // Reset currencies to their default state from mocks
          currencies.forEach((currency) => {
            // Only GHS, BRL and ARS are disabled by default
            currency.disabled = ["GHS", "BRL", "ARS"].includes(currency.name);
          });
        }

        // Sort currencies so enabled ones appear first
        currencies.sort((a, b) => {
          if (a.disabled === b.disabled) return 0;
          return a.disabled ? 1 : -1;
        });
      }

      registerFormFields();
    },
    [token, currency, formMethods, currencies, selectedNetwork],
  );

  // Reorder currencies based on user location
  useEffect(() => {
    let isMounted = true;

    reorderCurrenciesByLocation(currencies, formMethods)
      .then((reordered) => {
        if (isMounted) setOrderedCurrencies(reordered);
      })
      .catch(() => {
        if (isMounted) setOrderedCurrencies(currencies);
      });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencies]);

  const { isEnabled, buttonText, buttonAction } = useSwapButton({
    watch,
    balance,
    isDirty,
    isValid,
    isUserVerified,
    rate,
  });

  const handleSwap = () => {
    setOrderId("");
    handleSubmit(onSubmit)();
  };

  // Handle sent amount input changes
  interface SentAmountChangeEvent extends React.ChangeEvent<HTMLInputElement> {
    target: HTMLInputElement;
  }

  const handleSentAmountChange = (e: SentAmountChangeEvent): void => {
    let inputValue: string = e.target.value;

    // Special handling for when user directly types "."
    if (inputValue === ".") {
      setFormattedSentAmount("0.");
      setValue("amountSent", 0.0, { shouldDirty: true });
      setIsReceiveInputActive(false);
      return;
    }

    // Check if user is trying to add a decimal point to a number
    const currentValueStr: string = removeCommas(formattedSentAmount);
    if (
      inputValue.endsWith(".") &&
      currentValueStr !== "" &&
      !currentValueStr.includes(".")
    ) {
      // User added a decimal point to existing number
      const newValue: string = currentValueStr + ".";
      setFormattedSentAmount(formatNumberWithCommasForDisplay(newValue));
      setValue("amountSent", parseFloat(newValue) || 0, { shouldDirty: true });
      setIsReceiveInputActive(false);
      return;
    }

    // Remove commas for processing
    const cleanedValue: string = removeCommas(inputValue);

    // Allow empty input for clearing
    if (cleanedValue === "") {
      setFormattedSentAmount("");
      setValue("amountSent", 0, { shouldDirty: true });
      setIsReceiveInputActive(false);
      return;
    }

    // Validate as a number with optional decimal point
    // This regex allows: "123", "123.456", ".123"
    if (!/^(\d*\.?\d*)$/.test(cleanedValue)) return;

    const value: number = parseFloat(cleanedValue) || 0;

    // Only limit decimal places, allow any whole number
    if (cleanedValue.includes(".")) {
      const decimals: string | undefined = cleanedValue.split(".")[1];
      if (decimals?.length > 4) return;
    } // Update the form value
    setValue("amountSent", value, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setIsReceiveInputActive(false);
  };

  // Handle received amount input changes
  interface ReceivedAmountChangeEvent
    extends React.ChangeEvent<HTMLInputElement> {
    target: HTMLInputElement;
  }

  const handleReceivedAmountChange = (e: ReceivedAmountChangeEvent): void => {
    let inputValue: string = e.target.value;

    // Special handling for when user directly types "."
    if (inputValue === ".") {
      setFormattedReceivedAmount("0.");
      setValue("amountReceived", 0.0, { shouldDirty: true });
      setIsReceiveInputActive(true);
      return;
    }

    // Check if user is trying to add a decimal point to a number
    const currentValueStr: string = removeCommas(formattedReceivedAmount);
    if (
      inputValue.endsWith(".") &&
      currentValueStr !== "" &&
      !currentValueStr.includes(".")
    ) {
      // User added a decimal point to existing number
      const newValue: string = currentValueStr + ".";
      setFormattedReceivedAmount(formatNumberWithCommasForDisplay(newValue));
      setValue("amountReceived", parseFloat(newValue) || 0, {
        shouldDirty: true,
      });
      setIsReceiveInputActive(true);
      return;
    }

    // Remove commas for processing
    const cleanedValue: string = removeCommas(inputValue);

    // Allow empty input for clearing
    if (cleanedValue === "") {
      setFormattedReceivedAmount("");
      setValue("amountReceived", 0, { shouldDirty: true });
      setIsReceiveInputActive(true);
      return;
    }

    // Validate as a number with optional decimal point
    if (!/^(\d*\.?\d*)$/.test(cleanedValue)) return;

    const value: number = parseFloat(cleanedValue) || 0;

    // Only limit decimal places to 2 for receive amount
    if (cleanedValue.includes(".")) {
      const decimals: string | undefined = cleanedValue.split(".")[1];
      if (decimals?.length > 2) return;
    }

    setValue("amountReceived", value, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setIsReceiveInputActive(true);
  };

  return (
    <div className="mx-auto max-w-[27.3125rem]">
      <motion.form
        layout
        onSubmit={handleSubmit(onSubmit)}
        className="grid gap-4 pb-20 text-sm text-text-body transition-all dark:text-white sm:gap-2"
        noValidate
      >
        <div className="grid gap-2 rounded-[20px] bg-background-neutral p-2 dark:bg-white/5">
          <h3 className="px-2 py-1 text-base font-medium">Swap</h3>

          <motion.div
            layout
            className="relative space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-surface-canvas"
          >
            <div className="flex items-center justify-between">
              <label
                htmlFor="amount-sent"
                className="text-text-secondary dark:text-white/50"
              >
                Send
              </label>
              <AnimatePresence>
                {token && activeBalance && (
                  <AnimatedComponent
                    variant={slideInOut}
                    className="flex items-center gap-2"
                  >
                    <Wallet01Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
                    {isLoading ? (
                      <BalanceSkeleton className="w-24" />
                    ) : (
                      <>
                        <span
                          className={amountSent > balance ? "text-red-500" : ""}
                        >
                          {formatNumberWithCommasForDisplay(balance)} {token}
                        </span>
                        {balance > 0 && (
                          <button
                            type="button"
                            onClick={handleBalanceMaxClick}
                            className={classNames(
                              "font-medium text-lavender-500 dark:text-lavender-500",
                              balance === 0 ? "hidden" : "",
                            )}
                          >
                            Max
                          </button>
                        )}
                      </>
                    )}
                  </AnimatedComponent>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between gap-2">
              <input
                id="amount-sent"
                type="text"
                inputMode="decimal"
                onChange={handleSentAmountChange}
                onKeyDown={(e) => {
                  // Special handling for the decimal point key
                  if (e.key === "." && !formattedSentAmount.includes(".")) {
                    // If there's no decimal in the current value, we want to add it
                    e.preventDefault();
                    const newValue = formattedSentAmount
                      ? formattedSentAmount + "."
                      : "0.";
                    setFormattedSentAmount(newValue);
                    setValue(
                      "amountSent",
                      parseFloat(removeCommas(formattedSentAmount)) || 0,
                      { shouldDirty: true },
                    );
                    setIsReceiveInputActive(false);
                  }
                }}
                value={formattedSentAmount}
                className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
                  authenticated && (amountSent > balance || errors.amountSent)
                    ? "text-red-500 dark:text-red-500"
                    : "text-neutral-900 dark:text-white/80"
                }`}
                placeholder="0"
                title="Enter amount to send"
              />
              <FormDropdown
                defaultTitle="Select token"
                data={tokens}
                defaultSelectedItem={token}
                onSelect={(selectedToken) =>
                  setValue("token", selectedToken, { shouldDirty: true })
                }
                className="min-w-32"
                dropdownWidth={160}
              />
            </div>
            {(errors.amountSent || (authenticated && amountSent > balance)) && (
              <AnimatedComponent
                variant={slideInOut}
                className="!mt-0 text-xs text-red-500"
              >
                {errors.amountSent?.message ||
                  (authenticated && amountSent > balance
                    ? `Insufficient balance`
                    : null)}
              </AnimatedComponent>
            )}

            {/* Arrow showing swap direction */}
            <div className="absolute -bottom-5 left-1/2 z-10 w-fit -translate-x-1/2 rounded-xl border-4 border-background-neutral bg-background-neutral dark:border-white/5 dark:bg-surface-canvas">
              <div className="rounded-lg bg-white p-0.5 dark:bg-surface-canvas">
                {isFetchingRate ? (
                  <ImSpinner3 className="animate-spin text-xl text-outline-gray dark:text-white/50" />
                ) : (
                  <ArrowDown02Icon className="text-xl text-outline-gray dark:text-white/80" />
                )}
              </div>
            </div>
          </motion.div>

          {/* Amount to receive & currency */}
          <div className="space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-surface-canvas">
            <label
              htmlFor="amount-received"
              className="text-text-secondary dark:text-white/50"
            >
              Receive
            </label>

            <div className="flex items-center justify-between gap-2">
              <input
                id="amount-received"
                type="text"
                inputMode="decimal"
                onChange={handleReceivedAmountChange}
                onKeyDown={(e) => {
                  // Special handling for the decimal point key
                  if (e.key === "." && !formattedReceivedAmount.includes(".")) {
                    // If there's no decimal in the current value, we want to add it
                    e.preventDefault();
                    const newValue = formattedReceivedAmount
                      ? formattedReceivedAmount + "."
                      : "0.";
                    setFormattedReceivedAmount(newValue);
                    setValue(
                      "amountReceived",
                      parseFloat(removeCommas(formattedReceivedAmount)) || 0,
                      { shouldDirty: true },
                    );
                    setIsReceiveInputActive(true);
                  }
                }}
                value={formattedReceivedAmount}
                className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
                  errors.amountReceived
                    ? "text-red-500 dark:text-red-500"
                    : "text-neutral-900 dark:text-white/80"
                }`}
                placeholder="0"
                title="Enter amount to receive"
              />

              <FormDropdown
                defaultTitle="Select currency"
                data={orderedCurrencies}
                defaultSelectedItem={currency}
                onSelect={(selectedCurrency) =>
                  setValue("currency", selectedCurrency, { shouldDirty: true })
                }
                className="min-w-80"
                isCTA={
                  !currency &&
                  (!authenticated || (authenticated && !(amountSent > balance)))
                }
                dropdownWidth={320}
              />
            </div>
          </div>
        </div>

        {/* Recipient and memo */}
        <AnimatePresence>
          {currency &&
            (authenticated || isInjectedWallet) &&
            isUserVerified && (
              <AnimatedComponent
                variant={slideInOut}
                className="space-y-2 rounded-[20px] bg-gray-50 p-2 dark:bg-white/5"
                data-recipient-form="true"
              >
                <RecipientDetailsForm
                  formMethods={formMethods}
                  stateProps={stateProps}
                />

                {/* Memo */}
                <div className="relative">
                  <NoteEditIcon className="absolute left-3 top-3.5 size-4 text-icon-outline-secondary dark:text-white/50" />
                  <input
                    type="text"
                    id="memo"
                    onChange={(e) => {
                      formMethods.setValue("memo", e.target.value);
                    }}
                    value={formMethods.watch("memo")}
                    className={`min-h-11 w-full rounded-xl border border-gray-300 bg-transparent py-2 pl-9 pr-4 text-sm transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:bg-input-focus dark:placeholder:text-white/30 dark:focus-within:border-white/40 ${
                      errors.memo
                        ? "text-red-500 dark:text-red-500"
                        : "text-text-body dark:text-white/80"
                    }`}
                    placeholder="Add description (optional)"
                    maxLength={25}
                  />
                </div>
              </AnimatedComponent>
            )}
        </AnimatePresence>

        <AnimatePresence>
          {isKycModalOpen && (
            <AnimatedModal
              isOpen={isKycModalOpen}
              onClose={() => setIsKycModalOpen(false)}
            >
              <KycModal
                setIsKycModalOpen={setIsKycModalOpen}
                setIsUserVerified={setIsUserVerified}
              />
            </AnimatedModal>
          )}
        </AnimatePresence>

        {/* Loading and Submit buttons */}
        {!ready && (
          <button
            title="Loading..."
            type="button"
            className={`${primaryBtnClasses} cursor-not-allowed`}
            disabled
          >
            <ImSpinner className="mx-auto animate-spin text-xl" />
          </button>
        )}

        {ready && (
          <>
            <button
              type="button"
              className={primaryBtnClasses}
              disabled={!isEnabled}
              onClick={buttonAction(
                handleSwap,
                login,
                () =>
                  handleFundWallet(
                    activeWallet?.address ?? "",
                    amountSent.toString(),
                    (fetchedTokens.find((t) => t.symbol === token)
                      ?.address as `0x${string}`) ?? "",
                  ),
                () => setIsKycModalOpen(true),
                isUserVerified,
              )}
            >
              {buttonText}
            </button>
          </>
        )}

        <AnimatePresence>
          {currency && (
            <AnimatedComponent
              variant={slideInOut}
              className="flex w-full flex-col justify-between gap-2 py-3 text-xs text-text-disabled transition-all dark:text-white/30 xsm:flex-row xsm:items-center"
            >
              <div className="min-w-fit">
                {rateError ? (
                  <>No available quote</>
                ) : rate > 0 ? (
                  <>
                    1 {token} ~{" "}
                    {isFetchingRate
                      ? "..."
                      : formatNumberWithCommasForDisplay(rate)}{" "}
                    {currency}
                  </>
                ) : null}
              </div>
              <div className="ml-auto flex w-full flex-col justify-end gap-2 xsm:flex-row xsm:items-center">
                <div className="h-px w-1/2 flex-shrink bg-gradient-to-tr from-white to-gray-300 dark:bg-gradient-to-tr dark:from-neutral-900 dark:to-neutral-700 sm:w-full" />
                <p className="min-w-fit">Swap usually completes in 30s</p>
              </div>
            </AnimatedComponent>
          )}
        </AnimatePresence>
      </motion.form>

      {!isInjectedWallet && (
        <AnimatedModal
          isOpen={isFundModalOpen}
          onClose={() => setIsFundModalOpen(false)}
        >
          <FundWalletForm onClose={() => setIsFundModalOpen(false)} />
        </AnimatedModal>
      )}
    </div>
  );
};
